import type { Block, Sprite } from "@scratch/shared";
import { getBlockDef } from "./blockDefinitions.ts";

/**
 * Convert a sprite's block stack to JavaScript source code for the JS view.
 */
export function blocksToJS(sprite: Sprite): string {
  const lines: string[] = [];
  lines.push(`// === Sprite: ${sprite.name} ===`);
  lines.push(`const ${safeName(sprite.name)} = {`);
  lines.push(`  x: ${sprite.x}, y: ${sprite.y}, rotation: ${sprite.rotation}, scale: ${sprite.scale},`);
  lines.push(`  visible: ${sprite.visible},`);
  lines.push(`  variables: {},`);
  lines.push(`  lists: {},`);
  lines.push(`};`);
  lines.push("");

  // Build a map of blocks by id
  const blockMap = new Map<string, Block>();
  for (const b of sprite.blocks) blockMap.set(b.id, b);

  // Find root blocks (no parent)
  const roots = sprite.blocks.filter((b) => !b.parent);

  for (const root of roots) {
    lines.push(blockToJSStatement(root, blockMap, 0));
    lines.push("");
  }

  return lines.join("\n");
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[0-9]/, "_$&");
}

function indent(level: number): string {
  return "  ".repeat(level);
}

function val(block: Block, key: string): string {
  const input = block.inputs[key];
  if (!input) {
    const def = getBlockDef(block.type);
    const inputDef = def?.inputs?.find((i) => i.name === key);
    return JSON.stringify(inputDef?.default ?? 0);
  }
  if (typeof input.value === "string") return JSON.stringify(input.value);
  return String(input.value);
}

function blockToJSStatement(block: Block, map: Map<string, Block>, level: number): string {
  const ind = indent(level);
  let code = "";

  switch (block.type) {
    // Events
    case "event_whenflagclicked":
      code = `${ind}// When green flag clicked\n${ind}function onStart() {`;
      code += chainToJS(block, map, level + 1);
      code += `\n${ind}}`;
      break;
    case "event_whenkeypressed":
      code = `${ind}document.addEventListener('keydown', (e) => {\n${ind}  if (e.key === ${val(block, "KEY")}) {`;
      code += chainToJS(block, map, level + 2);
      code += `\n${ind}  }\n${ind}});`;
      break;
    case "event_whenthisspriteclicked":
      code = `${ind}sprite.onClick(() => {`;
      code += chainToJS(block, map, level + 1);
      code += `\n${ind}});`;
      break;
    case "event_broadcast":
      code = `${ind}broadcast(${val(block, "MESSAGE")});`;
      break;
    case "event_broadcastandwait":
      code = `${ind}await broadcastAndWait(${val(block, "MESSAGE")});`;
      break;
    case "event_whenbroadcastreceived":
      code = `${ind}onBroadcast(${val(block, "MESSAGE")}, () => {`;
      code += chainToJS(block, map, level + 1);
      code += `\n${ind}});`;
      break;
    case "event_whenbackdropswitches":
      code = `${ind}onBackdropSwitch(${val(block, "BACKDROP")}, () => {`;
      code += chainToJS(block, map, level + 1);
      code += `\n${ind}});`;
      break;

    // Motion
    case "motion_movesteps":
      code = `${ind}sprite.move(${val(block, "STEPS")});`;
      break;
    case "motion_turnright":
      code = `${ind}sprite.rotation += ${val(block, "DEGREES")};`;
      break;
    case "motion_turnleft":
      code = `${ind}sprite.rotation -= ${val(block, "DEGREES")};`;
      break;
    case "motion_gotoxy":
      code = `${ind}sprite.x = ${val(block, "X")}; sprite.y = ${val(block, "Y")};`;
      break;
    case "motion_glideto":
      code = `${ind}await sprite.glideTo(${val(block, "X")}, ${val(block, "Y")}, ${val(block, "SECS")});`;
      break;
    case "motion_changex":
      code = `${ind}sprite.x += ${val(block, "DX")};`;
      break;
    case "motion_changey":
      code = `${ind}sprite.y += ${val(block, "DY")};`;
      break;
    case "motion_setx":
      code = `${ind}sprite.x = ${val(block, "X")};`;
      break;
    case "motion_sety":
      code = `${ind}sprite.y = ${val(block, "Y")};`;
      break;
    case "motion_bounceonedge":
      code = `${ind}sprite.bounceOnEdge();`;
      break;
    case "motion_pointindirection":
      code = `${ind}sprite.rotation = ${val(block, "DIRECTION")};`;
      break;
    case "motion_pointtowards":
      code = `${ind}sprite.pointTowards(${val(block, "TARGET")});`;
      break;
    case "motion_gotorandom":
      code = `${ind}sprite.goToRandomPosition();`;
      break;

    // Looks
    case "looks_say":
      code = `${ind}sprite.say(${val(block, "MESSAGE")});`;
      break;
    case "looks_sayforsecs":
      code = `${ind}await sprite.sayFor(${val(block, "MESSAGE")}, ${val(block, "SECS")});`;
      break;
    case "looks_show":
      code = `${ind}sprite.visible = true;`;
      break;
    case "looks_hide":
      code = `${ind}sprite.visible = false;`;
      break;
    case "looks_setsize":
      code = `${ind}sprite.scale = ${val(block, "SIZE")} / 100;`;
      break;
    case "looks_changesize":
      code = `${ind}sprite.scale += ${val(block, "CHANGE")} / 100;`;
      break;
    case "looks_nextcostume":
      code = `${ind}sprite.nextCostume();`;
      break;
    case "looks_think":
      code = `${ind}sprite.think(${val(block, "MESSAGE")});`;
      break;
    case "looks_cleareffects":
      code = `${ind}sprite.clearGraphicEffects();`;
      break;
    case "looks_setcostume":
      code = `${ind}sprite.setCostume(${val(block, "COSTUME")});`;
      break;
    case "looks_goforward":
      code = `${ind}sprite.goForwardLayers(${val(block, "LAYERS")});`;
      break;
    case "looks_goback":
      code = `${ind}sprite.goBackLayers(${val(block, "LAYERS")});`;
      break;
    case "looks_setcolor":
      code = `${ind}sprite.setColor(${val(block, "COLOR")});`;
      break;

    // Sound
    case "sound_play":
      code = `${ind}playSound(${val(block, "SOUND")});`;
      break;
    case "sound_stop":
      code = `${ind}stopAllSounds();`;
      break;
    case "sound_setvolume":
      code = `${ind}setVolume(${val(block, "VOLUME")});`;
      break;
    case "sound_playuntildone":
      code = `${ind}await playSoundUntilDone(${val(block, "SOUND")});`;
      break;
    case "sound_changevolume":
      code = `${ind}changeVolume(${val(block, "VOLUME")});`;
      break;

    // Control
    case "control_wait":
      code = `${ind}await wait(${val(block, "DURATION")});`;
      break;
    case "control_repeat":
      code = `${ind}for (let i = 0; i < ${val(block, "TIMES")}; i++) {`;
      code += chainToJS(block, map, level + 1);
      code += `\n${ind}}`;
      break;
    case "control_forever":
      code = `${ind}while (true) {`;
      code += chainToJS(block, map, level + 1);
      code += `\n${ind}  await nextFrame();\n${ind}}`;
      break;
    case "control_if":
      code = `${ind}if (${val(block, "CONDITION")}) {`;
      code += chainToJS(block, map, level + 1);
      code += `\n${ind}}`;
      break;
    case "control_ifelse":
      code = `${ind}if (${val(block, "CONDITION")}) {`;
      code += chainToJS(block, map, level + 1);
      code += `\n${ind}} else {\n${ind}  // else branch\n${ind}}`;
      break;
    case "control_stop":
      code = `${ind}return; // stop all`;
      break;
    case "control_waituntil":
      code = `${ind}while (!${val(block, "CONDITION")}) { await nextFrame(); }`;
      break;
    case "control_repeatuntil":
      code = `${ind}while (!${val(block, "CONDITION")}) {`;
      code += chainToJS(block, map, level + 1);
      code += `\n${ind}  await nextFrame();\n${ind}}`;
      break;
    case "control_createclone":
      code = `${ind}createClone(${val(block, "SPRITE")});`;
      break;
    case "control_deleteclone":
      code = `${ind}deleteThisClone();`;
      break;

    // Variables
    case "variable_set":
      code = `${ind}sprite.variables[${val(block, "VAR")}] = ${val(block, "VALUE")};`;
      break;
    case "variable_change":
      code = `${ind}sprite.variables[${val(block, "VAR")}] += ${val(block, "VALUE")};`;
      break;
    case "variable_show":
      code = `${ind}showVariable(${val(block, "VAR")});`;
      break;
    case "variable_hide":
      code = `${ind}hideVariable(${val(block, "VAR")});`;
      break;

    // Lists
    case "list_add":
      code = `${ind}sprite.lists[${val(block, "LIST")}].push(${val(block, "ITEM")});`;
      break;
    case "list_delete":
      code = `${ind}sprite.lists[${val(block, "LIST")}].splice(${val(block, "INDEX")} - 1, 1);`;
      break;
    case "list_deleteall":
      code = `${ind}sprite.lists[${val(block, "LIST")}] = [];`;
      break;
    case "list_insert":
      code = `${ind}sprite.lists[${val(block, "LIST")}].splice(${val(block, "INDEX")} - 1, 0, ${val(block, "ITEM")});`;
      break;
    case "list_replace":
      code = `${ind}sprite.lists[${val(block, "LIST")}][${val(block, "INDEX")} - 1] = ${val(block, "ITEM")};`;
      break;
    case "list_item":
      code = `${ind}sprite.lists[${val(block, "LIST")}][${val(block, "INDEX")} - 1];`;
      break;
    case "list_length":
      code = `${ind}sprite.lists[${val(block, "LIST")}].length;`;
      break;
    case "list_contains":
      code = `${ind}sprite.lists[${val(block, "LIST")}].includes(${val(block, "ITEM")});`;
      break;

    // Operators
    case "operator_mod":
      code = `${ind}(${val(block, "NUM1")} % ${val(block, "NUM2")});`;
      break;
    case "operator_round":
      code = `${ind}Math.round(${val(block, "NUM")});`;
      break;
    case "operator_length":
      code = `${ind}String(${val(block, "STRING")}).length;`;
      break;
    case "operator_letterof":
      code = `${ind}String(${val(block, "STRING")})[${val(block, "INDEX")} - 1];`;
      break;
    case "operator_contains":
      code = `${ind}String(${val(block, "STRING1")}).includes(${val(block, "STRING2")});`;
      break;
    case "operator_mathop":
      code = `${ind}Math.${val(block, "OP").replace(/"/g, '')}(${val(block, "NUM")});`;
      break;

    // Sensing
    case "sensing_touchingcolor":
      code = `${ind}sprite.isTouchingColor(${val(block, "COLOR")});`;
      break;
    case "sensing_ask":
      code = `${ind}await ask(${val(block, "QUESTION")});`;
      break;
    case "sensing_answer":
      code = `${ind}getAnswer();`;
      break;
    case "sensing_timer":
      code = `${ind}getTimer();`;
      break;
    case "sensing_resettimer":
      code = `${ind}resetTimer();`;
      break;
    case "sensing_loudness":
      code = `${ind}getLoudness();`;
      break;
    case "sensing_dayssince2000":
      code = `${ind}daysSince2000();`;
      break;
    case "sensing_username":
      code = `${ind}getUsername();`;
      break;

    // Physics
    case "physics_setgravity":
      code = `${ind}physics.gravity = ${val(block, "G")};`;
      break;
    case "physics_setvelocity":
      code = `${ind}sprite.velocity = { x: ${val(block, "VX")}, y: ${val(block, "VY")} };`;
      break;
    case "physics_applyforce":
      code = `${ind}sprite.applyForce(${val(block, "FX")}, ${val(block, "FY")});`;
      break;
    case "physics_bounce":
      code = `${ind}sprite.bounceOffEdges();`;
      break;
    case "physics_setmass":
      code = `${ind}sprite.mass = ${val(block, "MASS")};`;
      break;
    case "physics_setbouncy":
      code = `${ind}sprite.bounciness = ${val(block, "BOUNCY")};`;
      break;

    // Custom
    case "custom_define":
      code = `${ind}function ${val(block, "NAME").replace(/"/g, "")}(${val(block, "PARAMS").replace(/"/g, "")}) {`;
      code += chainToJS(block, map, level + 1);
      code += `\n${ind}}`;
      break;
    case "custom_call":
      code = `${ind}${val(block, "NAME").replace(/"/g, "")}(${val(block, "ARGS").replace(/"/g, "")});`;
      break;

    default:
      code = `${ind}// ${block.type}(${JSON.stringify(block.inputs)})`;
  }

  return code;
}

function chainToJS(parent: Block, map: Map<string, Block>, level: number): string {
  // Find child blocks chained to this parent
  const children = [...map.values()].filter((b) => b.parent === parent.id);
  if (children.length === 0) return "";
  return "\n" + children.map((c) => blockToJSStatement(c, map, level)).join("\n");
}

/**
 * Convert all sprites to a single JS string.
 */
export function projectToJS(sprites: Sprite[]): string {
  return sprites.map(blocksToJS).join("\n\n");
}
