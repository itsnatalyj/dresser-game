===================================================
  ASSETS FOLDER — What goes here
===================================================

This folder holds all your images for the game.

--- BACKGROUND IMAGE ---

  File name:  drawer-bg.png
  Used by:    The main drawer scene (top-down view)
  How to add: In index.html, find the line that says:
                <div id="drawer-bg-placeholder">
              Remove that whole <div> block, then uncomment:
                <img src="assets/drawer-bg.png" ... />

  Recommended size: 1920 × 1080 px  (16:9)
  Format: PNG with transparency is fine, JPG also works.


--- OBJECT IMAGES ---

  File names (you can rename these, just update index.html too):
    obj-socks.png       → for the 🧦 object
    obj-folder.png      → for the 📁 object
    obj-crystal.png     → for the 🔮 object

  How to add: In index.html, find each .draggable-object div.
              Replace the <span>emoji</span> with:
                <img src="assets/obj-socks.png" />

  Recommended size: 200 × 200 px (square, transparent background)
  Format: PNG with transparency looks best.


--- TIPS ---

  - Keep file names lowercase with no spaces.
  - PNG with transparent backgrounds will look the most natural.
  - You can add as many objects as you like — just copy one of the
    existing .draggable-object divs in index.html and add a matching
    entry in STARTING_POSITIONS inside js/main.js.

===================================================
