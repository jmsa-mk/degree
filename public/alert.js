const sound = document.getElementById('alert-sound');
sound.volume = 0.7;
let lastSoundAt = -Infinity;
window.focusAlert.onContent(({events, sound: soundEnabled})=>{
  const unique = [...new Map(events.map(event=>[event.issue,event])).values()];
  document.getElementById('title').textContent = unique.map(event=>event.title).join(' · ');
  document.getElementById('message').textContent = unique.map(event=>event.body).join(' ');
  // Closely spaced eye/head alerts share one chime rather than overlapping.
  if (soundEnabled && events.length && performance.now() - lastSoundAt >= 1500) {
    lastSoundAt = performance.now();
    sound.currentTime = 0;
    sound.play().catch(() => window.focusAlert.soundFallback());
  }
});
document.getElementById('dismiss').addEventListener('click',()=>window.focusAlert.dismiss());
document.getElementById('open').addEventListener('click',()=>window.focusAlert.open());
