SOUNDS — intentionally empty.

Every sound in the game (footsteps, husk rustle, giggle, static, door servo,
thumps, heartbeat, jumpscare scream, 6AM chime, room tone) is synthesized at
runtime with WebAudio in js/audio.js. There are no audio files to host, no
loading, no licensing.

If you later want recorded audio, replace the individual functions in
js/audio.js (each sound is one small self-contained function) with
AudioBufferSourceNode players — the positional plumbing (out(pos)) can be
reused as-is.
