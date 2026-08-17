MODELS — drop .glb files here. The game runs fine while this folder is empty
(procedural placeholders are used and a console warning is logged per file).

Expected files (declared in js/config.js ASSETS.models — change only the
`url` string there if you use different names):

  CHARACTERS (see README.md "ASSET SWAP GUIDE" for scale/orientation/rig rules)
    chompy.glb       big bulky killer     target height 1.95 m
    cob.glb          tall thin killer     target height 2.10 m
    boo.glb          small pale killer    target height 1.40 m
    goldencob.glb    seated golden killer target height 1.30 m (authored slumped/seated)

  FURNITURE (simple static props; origin at floor center)
    couch.glb        armchair.glb     tv.glb        desk.glb      shelf.glb
    fridge.glb       counter.glb      table.glb     chair.glb     car.glb
    lamp.glb         microwave.glb    swingset.glb

Rules that make swaps zero-effort:
  * origin at the FEET / floor point, model facing +Z
  * real-world meters (auto-scale matches bounding-box height to the target
    height in ASSETS, so proportions matter more than absolute size)
  * one .glb per entry, textures embedded in the .glb
  * rigged characters: if the file contains animation clips, clip #0 is
    auto-played as idle. Bone names do not matter to the game.
