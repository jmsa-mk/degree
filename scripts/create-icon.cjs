const { app, nativeImage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app
  .whenReady()
  .then(() => {
    const logo = nativeImage.createFromPath(
      path.resolve("public/brand/logo.png"),
    );
    if (logo.isEmpty()) throw new Error("The DegreeBee logo could not be loaded.");
    const png = logo
      .resize({ width: 256, height: 256, quality: "best" })
      .toPNG();
    fs.writeFileSync("public/icon.png", png);
    const header = Buffer.alloc(22);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    header.writeUInt16LE(1, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(png.length, 14);
    header.writeUInt32LE(22, 18);
    fs.writeFileSync("build/icon.ico", Buffer.concat([header, png]));
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
