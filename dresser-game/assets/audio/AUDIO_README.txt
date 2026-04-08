===================================================
  AUDIO FOLDER — What goes here
===================================================

Drop your audio files into this folder.
Then update the file paths in js/audio.js (AUDIO_FILES section).


--- BACKGROUND MUSIC ---

  File name:  music.mp3  (or .ogg / .wav)
  Purpose:    Loops continuously at low volume in the background.
  Tips:
    - Any length works — it loops seamlessly.
    - Ideal: soft ambient, lo-fi, or gentle piano.
    - Avoid anything with lyrics or strong beats.
    - Recommended volume on the file itself: keep it fairly quiet.


--- SOUND EFFECTS ---

  pickup.mp3 — plays when you pinch an object to grab it
               Ideal: a soft chime, a light "pick up" click, a twinkle

  drop.mp3   — plays when you release an object
               Ideal: a soft thud, a gentle settling sound, a fabric sound

  reset.mp3  — plays when the Reset button is clicked
               Ideal: a short sparkle, a soft "whoosh", a gentle chime cascade


--- FORMAT NOTES ---

  - .mp3 is safest for cross-browser compatibility
  - .ogg also works in Chrome
  - .wav works but files are much larger
  - Keep SFX short: under 1 second is ideal
  - Keep music file under ~5MB for fast loading


--- WHAT HAPPENS WITHOUT FILES ---

  If a file is missing or fails to load, the game falls back to gentle
  synthesized sounds (generated with Web Audio API). The game always has
  sound — you're just upgrading quality when you add real files.


--- HOW TO CHANGE VOLUME ---

  Open  js/audio.js  and find the VOLUMES section near the top:

    const VOLUMES = {
      music:  0.13,   ← background music
      pickup: 0.42,   ← grab sound
      drop:   0.38,   ← release sound
      reset:  0.40,   ← reset sound
    };

  Change any number between 0.0 (silent) and 1.0 (full volume).

===================================================
