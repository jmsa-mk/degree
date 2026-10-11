const fs = require("node:fs");
const path = require("node:path");
const { summarize } = require("./session.cjs");

class SessionStore {
  constructor(directory) {
    this.directory = directory;
    fs.mkdirSync(directory, { recursive: true });
  }

  save(data) {
    if (!/^[0-9a-f-]{36}$/.test(data.id))
      throw new Error("Invalid session ID.");
    const destination = path.join(this.directory, `${data.id}.json`);
    const temp = `${destination}.tmp`;
    const fd = fs.openSync(temp, "w");
    try {
      fs.writeFileSync(fd, JSON.stringify(data, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // Keep the last good version if a write is interrupted or disk data is damaged.
    if (fs.existsSync(destination)) {
      let previous;
      try {
        previous = JSON.parse(fs.readFileSync(destination, "utf8"));
      } catch {
        /* Preserve existing backup. */
      }
      if (previous?.id === data.id && previous?.schema === 1)
        fs.copyFileSync(destination, `${destination}.bak`);
    }
    fs.renameSync(temp, destination);
  }

  list() {
    const sessions = [],
      warnings = [];
    const ids = new Set(
      fs
        .readdirSync(this.directory)
        .filter((name) => /^[0-9a-f-]{36}\.json(?:\.bak|\.tmp)?$/.test(name))
        .map((name) => name.slice(0, 36)),
    );
    for (const id of ids) {
      let data;
      for (const suffix of [".json", ".json.tmp", ".json.bak"]) {
        try {
          const value = JSON.parse(
            fs.readFileSync(path.join(this.directory, id + suffix), "utf8"),
          );
          if (
            value.id !== id ||
            value.schema !== 1 ||
            !value.counts ||
            !Array.isArray(value.timeline) ||
            ![
              "focused",
              "no_face",
              "eyes_closed",
              "looking_away",
              "unobserved",
              "paused",
            ].every(
              (key) =>
                Number.isFinite(value.counts[key]) && value.counts[key] >= 0,
            )
          ) {
            throw new Error("Invalid report");
          }
          data = summarize(value);
          if (suffix !== ".json")
            warnings.push(`Report ${id} was loaded from a backup.`);
          break;
        } catch {
          /* Try the previous checkpoint without replacing damaged files. */
        }
      }
      if (data) sessions.push(data);
      else
        warnings.push(
          `Report ${id} could not be read. The original file has been preserved.`,
        );
    }
    return {
      sessions: sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      warnings,
    };
  }

  remove(id) {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id))
      throw new Error("Invalid session ID.");
    // Remove recovery copies first; a deleted session must not reappear on restart.
    for (const suffix of [".json.bak", ".json.tmp", ".json"]) {
      try {
        fs.unlinkSync(path.join(this.directory, id + suffix));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }

  recover() {
    for (const report of this.list().sessions) {
      if (report.status !== "running" && report.status !== "paused") continue;
      // End at the last durable checkpoint, not at the time of reopening.
      this.save({
        ...report,
        status: "interrupted",
        endReason: "recovered",
        endedAt: report.updatedAt,
      });
    }
  }
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

function toCsv(sessions) {
  const rows = [
    [
      "ID",
      "Session name",
      "Started (ISO)",
      "Ended (ISO)",
      "Status",
      "Focused (seconds)",
      "Distracted (seconds)",
      "Face not visible (seconds)",
      "Eyes closed (seconds)",
      "Looking away (seconds)",
      "Unobserved (seconds)",
      "Paused (seconds)",
      "Focus score (%)",
      "Observation coverage (%)",
    ],
  ];
  const sec = (ms) => (ms / 1000).toFixed(1);
  for (const s of sessions)
    rows.push([
      s.id,
      s.title,
      s.startedAt,
      s.endedAt,
      s.status,
      sec(s.focusMs),
      sec(s.distractedMs),
      sec(s.counts.no_face),
      sec(s.counts.eyes_closed),
      sec(s.counts.looking_away),
      sec(s.counts.unobserved),
      sec(s.counts.paused),
      s.score,
      s.coverage,
    ]);
  return "\ufeff" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

module.exports = { SessionStore, toCsv };
