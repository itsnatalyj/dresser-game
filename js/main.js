/* ================================================================
   DRESSER DRAWER GAME — main.js
   Complete implementation: hand tracking, pinch-to-drag, reset

   SECTIONS:
     1.  Configuration — sizes, positions, thresholds
     2.  DOM References — pointers to HTML elements
     3.  Starting Positions — home location of each object
     4.  Setup — place objects at start
     5.  Hand Tracking — MediaPipe setup & camera
     6.  Hand Results — process each frame
     7.  Pinch Logic — detect grab / drag / release
     8.  Coordinate Mapping — camera space → game space
     9.  Drawing — dots on the hand-canvas overlay
     10. Reset — return all objects home
   ================================================================ */


/* ────────────────────────────────────────────────────────────────
   1. CONFIGURATION
   Tweak these numbers to adjust how the interaction feels.
   ──────────────────────────────────────────────────────────────── */

// How close thumb and index must get to START a grab (0–1 scale).
// Lower = harder to trigger accidentally. 0.055 requires a deliberate pinch.
const PINCH_ON_THRESHOLD  = 0.055;

// How far apart they must be to RELEASE (bigger gap = stable while held).
const PINCH_OFF_THRESHOLD = 0.085;

// How many consecutive video frames the pinch must be detected before a
// grab fires. At ~30fps, 4 frames ≈ 130ms — long enough to ignore
// accidental hand movements, short enough to feel instant.
const PINCH_FRAMES_REQUIRED = 4;

// How much to smooth the cursor movement (0 = instant, 1 = frozen).
// Higher = silkier but slightly more lag.
const SMOOTHING = 0.75;

// Safe-zone margin: objects are clamped this far from the game edge
// so they can never get stuck behind UI elements or off-screen.
// Value is a fraction of the game area's width/height (0.04 = 4%).
const DRAG_MARGIN = 0.04;

// How many consecutive frames the LEFT HAND fist must be detected
// before a 90° rotation fires. 3 frames ≈ 100ms — deliberate but snappy.
const FIST_FRAMES_REQUIRED = 3;

// (Grab detection uses each object's actual bounding box — see tryGrab())


/* ────────────────────────────────────────────────────────────────
   2. DOM REFERENCES
   ──────────────────────────────────────────────────────────────── */
const gameArea        = document.getElementById('game-area');
const webcamVideo     = document.getElementById('webcam');
const handCanvas      = document.getElementById('hand-canvas');
const handCursor      = document.getElementById('hand-cursor');
const statusLabel     = document.getElementById('camera-status');
const hintText        = document.getElementById('hint-text');

// All draggable object elements
const objectElements  = Array.from(document.querySelectorAll('.draggable-object'));

// Canvas 2D drawing context (for hand landmark dots)
const ctx             = handCanvas.getContext('2d');


/* ────────────────────────────────────────────────────────────────
   3. STARTING POSITIONS
   These are the HOME positions for every object.
   Values are percentages (0–100) of the game area dimensions.
   left: 0 = far left edge, 100 = far right edge
   top:  0 = top edge,      100 = bottom edge
   The object's CENTER is placed at this point.

   To reposition an object: change its numbers here.
   To add a new object:
     1. Add a div in index.html
     2. Add its ID and position here
   ──────────────────────────────────────────────────────────────── */
const STARTING_POSITIONS = {
  'obj-ring':       { left: '17.0%', top: '14.5%' },
  'obj-brush':      { left: '67.4%', top: '16.0%' },
  'obj-sunglasses': { left: '21.5%', top: '41.0%' },
  'obj-perfume':    { left: '29.6%', top: '65.4%' },
  'obj-envelope':   { left: '60.8%', top: '50.2%' },
  'obj-scrunchie':  { left: '59.3%', top: '65.8%' },
  'obj-lipstick':   { left: '67.8%', top: '62.9%' },
};


/* ────────────────────────────────────────────────────────────────
   4. SETUP — place objects at their starting positions
   ──────────────────────────────────────────────────────────────── */
function placeObjectsAtStart() {
  for (const [id, pos] of Object.entries(STARTING_POSITIONS)) {
    const el = document.getElementById(id);
    if (el) {
      el.style.left = pos.left;
      el.style.top  = pos.top;
      // Reset rotation to 0° at start
      objectRotations[id] = 0;
      el.style.setProperty('--rot', '0deg');
    }
  }
}


/* ────────────────────────────────────────────────────────────────
   5. HAND TRACKING — MediaPipe Hands setup

   MediaPipe gives us 21 landmark points on the hand, each with
   normalized x/y coordinates (0 to 1, relative to video frame).

   Key landmarks we use:
     landmark[4]  = Thumb tip
     landmark[8]  = Index finger tip
   ──────────────────────────────────────────────────────────────── */
function initHandTracking() {

  // Create the Hands detector
  // locateFile tells MediaPipe where to load its WASM model from
  const hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  // Configure the detector
  hands.setOptions({
    maxNumHands: 2,           // Track both hands: right (pinch) + left (fist rotate)
    modelComplexity: 1,       // 0 = fast, 1 = accurate
    minDetectionConfidence: 0.7,
    minTrackingConfidence:  0.5,
  });

  // Register our callback — called once per video frame
  hands.onResults(processHandResults);

  // Create the Camera utility
  // This handles getUserMedia + feeding frames to MediaPipe
  const camera = new Camera(webcamVideo, {
    onFrame: async () => {
      await hands.send({ image: webcamVideo });
    },
    width:  640,
    height: 480,
  });

  // Start the camera (this triggers the browser's camera permission prompt)
  camera.start()
    .then(() => {
      statusLabel.textContent = '✋ Show your hand';
      console.log('✅ Camera and hand tracking started!');
    })
    .catch((err) => {
      statusLabel.textContent = '⚠️ Camera not found';
      statusLabel.style.color = '#ffaaaa';
      console.error('❌ Camera error:', err);
    });
}


/* ────────────────────────────────────────────────────────────────
   6. HAND RESULTS — process each incoming video frame

   This function is called ~30 times per second by MediaPipe.
   It reads the hand landmarks (if any), updates the cursor,
   and drives the pinch / grab / drag logic.
   ──────────────────────────────────────────────────────────────── */
// Smoothed cursor position in game-area pixels
let smoothX = 0;
let smoothY = 0;

// Was the user pinching in the previous frame?
let wasPinching = false;

// How many consecutive frames the pinch has been detected.
// Must reach PINCH_FRAMES_REQUIRED before a grab fires.
let pinchHoldCount = 0;

// Left hand fist state — for rotation
let wasLeftFist  = false;
let leftFistCount = 0;

// Rotation step per object (0–3). Each step = 90°. 4 steps = full circle back.
const objectRotations = {};

// Was a hand visible in the previous frame?
let wasHandVisible = false;

function processHandResults(results) {
  // Clear the hand-canvas overlay every frame
  ctx.clearRect(0, 0, handCanvas.width, handCanvas.height);

  // ── No hands detected ─────────────────────────────────────────
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    if (wasPinching) releaseGrab();
    wasPinching     = false;
    pinchHoldCount  = 0;
    wasLeftFist     = false;
    leftFistCount   = 0;
    wasHandVisible  = false;
    handCursor.style.display = 'none';
    return;
  }

  // ── Identify left / right hands ───────────────────────────────
  // MediaPipe labels hands from the camera's perspective (un-mirrored feed).
  // Because webcam video is naturally flipped left-right:
  //   MediaPipe "Left"  → user's RIGHT hand  (pinch / drag)
  //   MediaPipe "Right" → user's LEFT hand   (fist / rotate)
  let rightLandmarks = null;   // right hand (pinch)
  let leftLandmarks  = null;   // left  hand (fist)

  for (let i = 0; i < results.multiHandLandmarks.length; i++) {
    const label = results.multiHandedness[i].label;
    if (label === 'Left')  rightLandmarks = results.multiHandLandmarks[i];
    else                   leftLandmarks  = results.multiHandLandmarks[i];
  }

  // First time seeing any hand: hide hint, update status label
  if (!wasHandVisible && (rightLandmarks || leftLandmarks)) {
    hintText.style.display  = 'none';
    statusLabel.textContent = '🤌 Pinch · ✊ Rotate';
    wasHandVisible          = true;
  }


  // ── RIGHT HAND — pinch to grab & drag ─────────────────────────
  if (rightLandmarks) {
    drawHandOnCanvas(rightLandmarks);

    // Thumb tip (4) and index tip (8)
    const thumb = rightLandmarks[4];
    const index = rightLandmarks[8];
    const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);

    // Pinch midpoint → game coordinates → smoothed cursor
    const rawX = (thumb.x + index.x) / 2;
    const rawY = (thumb.y + index.y) / 2;
    const gameCoords = videoToGamePixels(rawX, rawY);
    smoothX = smoothX * SMOOTHING + gameCoords.x * (1 - SMOOTHING);
    smoothY = smoothY * SMOOTHING + gameCoords.y * (1 - SMOOTHING);
    showCursor(smoothX, smoothY);

    // Pinch state: hysteresis + frame debounce
    const rawClose = pinchDist < (wasPinching ? PINCH_OFF_THRESHOLD : PINCH_ON_THRESHOLD);
    let isPinching;
    if (!wasPinching) {
      pinchHoldCount = rawClose ? pinchHoldCount + 1 : 0;
      isPinching = pinchHoldCount >= PINCH_FRAMES_REQUIRED;
    } else {
      isPinching = rawClose;
      if (!isPinching) pinchHoldCount = 0;
    }

    if (isPinching && !wasPinching) {
      handCursor.classList.add('pinching');
      tryGrab(smoothX, smoothY);
    } else if (!isPinching && wasPinching) {
      handCursor.classList.remove('pinching');
      releaseGrab();
    } else if (isPinching && grabbedObject) {
      moveDraggedObject(smoothX, smoothY);
    }

    wasPinching = isPinching;

  } else {
    // Right hand left the frame → drop anything held
    if (wasPinching) releaseGrab();
    wasPinching    = false;
    pinchHoldCount = 0;
    handCursor.style.display = 'none';
  }


  // ── LEFT HAND — fist to rotate the grabbed object 90° ─────────
  if (leftLandmarks) {
    const fistNow = detectFist(leftLandmarks);
    leftFistCount = fistNow ? leftFistCount + 1 : 0;
    const isFist  = leftFistCount >= FIST_FRAMES_REQUIRED;

    // Rising edge only: fires once per fist-close gesture
    if (isFist && !wasLeftFist) {
      rotateGrabbedObject();
    }
    wasLeftFist = isFist;

  } else {
    // Left hand left the frame
    wasLeftFist  = false;
    leftFistCount = 0;
  }
}


/* ────────────────────────────────────────────────────────────────
   7. PINCH / DRAG / RELEASE LOGIC
   ──────────────────────────────────────────────────────────────── */

// The currently grabbed object element (null = nothing grabbed)
let grabbedObject = null;

// The offset from pinch point to object center when grab started.
// Preserves the object's relative position under your fingers —
// so objects don't "snap" to your pinch point on grab.
let grabOffsetX = 0;
let grabOffsetY = 0;


// Grab the object whose rendered bounding box contains the pinch point.
// This is precise — only the exact object under your fingers is grabbed.
// No more accidentally picking up nearby objects.
function tryGrab(gx, gy) {
  const gameRect = gameArea.getBoundingClientRect();

  // Collect every object whose bounding box covers the pinch point
  const hits = [];
  for (const el of objectElements) {
    const r    = el.getBoundingClientRect();
    const left   = r.left   - gameRect.left;
    const top    = r.top    - gameRect.top;
    const right  = left + r.width;
    const bottom = top  + r.height;

    if (gx >= left && gx <= right && gy >= top && gy <= bottom) {
      hits.push(el);
    }
  }

  if (hits.length === 0) return;   // pinch missed all objects

  // If two objects overlap at the pinch point, grab the last one
  // in the list (it renders on top and is the "front" object)
  const el = hits[hits.length - 1];

  grabbedObject = el;
  const center  = getObjectCenter(el);
  grabOffsetX   = center.x - gx;
  grabOffsetY   = center.y - gy;
  el.classList.add('is-grabbed');
  playPickup();   // ← audio
  console.log(`🤌 Grabbed: ${el.id}`);
}


// Move the grabbed object to follow (gx, gy) + the stored offset
function moveDraggedObject(gx, gy) {
  if (!grabbedObject) return;
  const gameRect = gameArea.getBoundingClientRect();

  // Target position in game-area pixels (with offset preserved)
  const targetX = gx + grabOffsetX;
  const targetY = gy + grabOffsetY;

  // Clamp to safe zone so objects can't get stuck behind UI or off-screen
  const minX = gameRect.width  * DRAG_MARGIN;
  const maxX = gameRect.width  * (1 - DRAG_MARGIN);
  const minY = gameRect.height * DRAG_MARGIN;
  const maxY = gameRect.height * (1 - DRAG_MARGIN);
  const clampedX = Math.max(minX, Math.min(maxX, targetX));
  const clampedY = Math.max(minY, Math.min(maxY, targetY));

  // Convert to percentage and apply to the element
  grabbedObject.style.left = (clampedX / gameRect.width  * 100) + '%';
  grabbedObject.style.top  = (clampedY / gameRect.height * 100) + '%';
}


// Drop the currently grabbed object in place
// Adds a brief "settle" transition so the object glides softly to rest
// instead of stopping abruptly when the pinch opens.
function releaseGrab() {
  if (!grabbedObject) return;
  const el = grabbedObject;
  el.classList.remove('is-grabbed');
  playDrop();     // ← audio

  // Temporarily add a smooth position transition for the settle
  el.style.transition =
    'filter 0.2s ease, transform 0.2s ease, ' +
    'left 0.22s cubic-bezier(0.2, 0.8, 0.35, 1), ' +
    'top  0.22s cubic-bezier(0.2, 0.8, 0.35, 1)';

  // Remove the inline transition after it completes so future grabs are instant
  setTimeout(() => { el.style.transition = ''; }, 280);

  console.log(`🖐 Released: ${el.id}`);
  grabbedObject = null;
  grabOffsetX   = 0;
  grabOffsetY   = 0;
}


// Returns true when the hand is making a fist.
// Checks that at least 3 of the 4 main fingertips have curled
// below (higher y) their base knuckle — the signature of a closed fist.
function detectFist(landmarks) {
  const tips  = [8,  12, 16, 20];   // index, middle, ring, pinky tips
  const bases = [5,   9, 13, 17];   // matching MCP (base) knuckles
  let curled = 0;
  for (let i = 0; i < 4; i++) {
    if (landmarks[tips[i]].y > landmarks[bases[i]].y) curled++;
  }
  return curled >= 3;
}


// Rotate the currently grabbed object 90° clockwise.
// Four fist-closes = 360° = back to starting orientation.
function rotateGrabbedObject() {
  if (!grabbedObject) return;

  const current = objectRotations[grabbedObject.id] || 0;
  const next    = (current + 90) % 360;
  objectRotations[grabbedObject.id] = next;

  // Springy rotation animation (bounces slightly past then settles)
  grabbedObject.style.transition =
    'filter 0.1s ease, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)';
  grabbedObject.style.setProperty('--rot', `${next}deg`);

  // Remove inline transition after animation so normal grab/drop transitions resume
  setTimeout(() => { grabbedObject.style.transition = ''; }, 350);

  console.log(`🔄 Rotated ${grabbedObject.id} → ${next}°`);
}


// Get the CENTER of an object in game-area pixel coordinates
function getObjectCenter(el) {
  const gameRect = gameArea.getBoundingClientRect();
  const objRect  = el.getBoundingClientRect();
  return {
    x: objRect.left + objRect.width  / 2 - gameRect.left,
    y: objRect.top  + objRect.height / 2 - gameRect.top,
  };
}


/* ────────────────────────────────────────────────────────────────
   8. COORDINATE MAPPING
   Converts MediaPipe's normalized video coordinates (0–1)
   into pixel coordinates inside the game area.

   We flip X because the video is displayed mirrored —
   so left/right feel natural as if looking in a mirror.
   ──────────────────────────────────────────────────────────────── */
function videoToGamePixels(normX, normY) {
  const rect = gameArea.getBoundingClientRect();
  return {
    x: (1 - normX) * rect.width,   // flip X to match mirrored video
    y: normY        * rect.height,
  };
}


/* ────────────────────────────────────────────────────────────────
   9. DRAWING — hand landmarks on the canvas overlay
   ──────────────────────────────────────────────────────────────── */

// Show and position the cursor dot on the game area
function showCursor(gx, gy) {
  handCursor.style.display = 'block';
  handCursor.style.left    = gx + 'px';
  handCursor.style.top     = gy + 'px';
}

// Draw the hand skeleton and highlight thumb/index in the camera preview
function drawHandOnCanvas(landmarks) {
  const w = handCanvas.width;   // 640
  const h = handCanvas.height;  // 480

  // ── Draw skeleton connections ──────────────────────────────────
  // HAND_CONNECTIONS is the list of pairs provided by MediaPipe
  if (typeof drawConnectors !== 'undefined') {
    drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
      color: 'rgba(255, 255, 255, 0.35)',
      lineWidth: 1.5,
    });
  }

  // ── Draw all 21 landmarks as small dots ────────────────────────
  if (typeof drawLandmarks !== 'undefined') {
    drawLandmarks(ctx, landmarks, {
      color: 'rgba(255, 220, 180, 0.75)',
      fillColor: 'rgba(255, 190, 140, 0.6)',
      lineWidth: 1,
      radius: 2.5,
    });
  }

  // ── Highlight thumb tip (landmark 4) ──────────────────────────
  const thumb = landmarks[4];
  ctx.beginPath();
  ctx.arc(thumb.x * w, thumb.y * h, 7, 0, Math.PI * 2);
  ctx.fillStyle   = 'rgba(255, 140, 100, 0.9)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth   = 1.5;
  ctx.fill();
  ctx.stroke();

  // ── Highlight index tip (landmark 8) ─────────────────────────
  const index = landmarks[8];
  ctx.beginPath();
  ctx.arc(index.x * w, index.y * h, 7, 0, Math.PI * 2);
  ctx.fillStyle   = 'rgba(140, 190, 255, 0.9)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth   = 1.5;
  ctx.fill();
  ctx.stroke();

  // ── Draw a line between thumb and index ──────────────────────
  // Gets shorter (and more visible) as they approach each other
  const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
  const alpha     = Math.max(0, 1 - pinchDist / 0.15); // fades in as they close

  if (alpha > 0.05) {
    ctx.beginPath();
    ctx.moveTo(thumb.x * w, thumb.y * h);
    ctx.lineTo(index.x * w, index.y * h);
    ctx.strokeStyle = `rgba(255, 220, 150, ${alpha * 0.8})`;
    ctx.lineWidth   = 2;
    ctx.stroke();
  }
}


/* ────────────────────────────────────────────────────────────────
   10. RESET
   Returns every object to its exact starting position.
   Called by the Reset button's onclick in index.html.
   ──────────────────────────────────────────────────────────────── */
function resetObjects() {
  // Drop anything currently being held (without its settle animation)
  if (grabbedObject) {
    grabbedObject.classList.remove('is-grabbed');
    grabbedObject = null;
    grabOffsetX = 0;
    grabOffsetY = 0;
  }

  // Give every object a smooth glide back to its starting position
  for (const el of objectElements) {
    el.style.transition =
      'filter 0.2s ease, transform 0.2s ease, ' +
      'left 0.45s cubic-bezier(0.3, 0, 0.2, 1), ' +
      'top  0.45s cubic-bezier(0.3, 0, 0.2, 1)';
  }

  playReset();    // ← audio

  // Move them home
  placeObjectsAtStart();

  // Clean up the inline transitions once the animation finishes
  setTimeout(() => {
    for (const el of objectElements) { el.style.transition = ''; }
  }, 520);

  console.log('🔄 Reset — all objects gliding back to starting positions');
}


/* ────────────────────────────────────────────────────────────────
   START EVERYTHING
   ──────────────────────────────────────────────────────────────── */
placeObjectsAtStart();
initHandTracking();
