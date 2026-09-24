import commands from "./vendor/scratchblocks-commands";

export type InputKind = "number" | "text" | "boolean" | "color" | "menu";

export type InputDef = {
  kind: InputKind;
  round: boolean;
  default: string;
  options?: string[];
};

export type BlockDef = {
  key: string;
  category: string;
  shape: string;
  spec: string;
  inputs: InputDef[];
  label: string;
  // Custom code builder for blocks the plain spec cannot express.
  build?: (values: string[]) => string;
};

export const CATEGORY_NAMES: Record<string, string> = {
  motion: "Motion",
  looks: "Looks",
  sound: "Sound",
  events: "Events",
  control: "Control",
  sensing: "Sensing",
  operators: "Operators",
  variables: "Variables",
  list: "Lists",
  custom: "My Blocks",
  music: "Music",
  pen: "Pen",
  video: "Video Sensing",
  tts: "Text to Speech",
  translate: "Translate",
  faceSensing: "Face Sensing",
  makeymakey: "Makey Makey",
  microbit: "micro:bit",
  ev3: "LEGO MINDSTORMS EV3",
  wedo: "LEGO Education WeDo 2.0",
  gdxfor: "Go Direct Force & Acceleration",
  boost: "LEGO BOOST",
};

const EXTENSIONS = new Set([
  "music",
  "pen",
  "video",
  "tts",
  "translate",
  "faceSensing",
  "makeymakey",
  "microbit",
  "ev3",
  "wedo",
  "gdxfor",
  "boost",
]);

// Scratch 2 leftovers that the Scratch 3 palette no longer shows.
const EXCLUDED_IDS = new Set([
  "pen.changeHue",
  "pen.setHue",
  "pen.changeShade",
  "pen.setShade",
]);

const SPRITE = "Sprite1";
const KEYS = [
  "space",
  "up arrow",
  "down arrow",
  "right arrow",
  "left arrow",
  "any",
  ..."abcdefghijklmnopqrstuvwxyz0123456789".split(""),
];
const DRUMS = [
  "Snare Drum",
  "Bass Drum",
  "Side Stick",
  "Crash Cymbal",
  "Open Hi-Hat",
  "Closed Hi-Hat",
  "Tambourine",
  "Hand Clap",
  "Claves",
  "Wood Block",
  "Cowbell",
  "Triangle",
  "Bongo",
  "Conga",
  "Cabasa",
  "Guiro",
  "Vibraslap",
  "Cuica",
].map((d, i) => `(${i + 1}) ${d}`);
const INSTRUMENTS = [
  "Piano",
  "Electric Piano",
  "Organ",
  "Guitar",
  "Electric Guitar",
  "Bass",
  "Pizzicato",
  "Cello",
  "Trombone",
  "Clarinet",
  "Saxophone",
  "Flute",
  "Wooden Flute",
  "Bassoon",
  "Choir",
  "Vibraphone",
  "Music Box",
  "Steel Drum",
  "Marimba",
  "Synth Lead",
  "Synth Pad",
].map((d, i) => `(${i + 1}) ${d}`);
const FACE_PARTS = [
  "nose",
  "mouth",
  "left eye",
  "right eye",
  "between eyes",
  "left ear",
  "right ear",
  "top of head",
];
const TILT4 = ["front", "back", "left", "right"];
const TILT_UD = ["up", "down", "left", "right"];

type Menu = { options: string[]; round?: boolean };

// Menus keyed by scratchblocks menu name, or by "<block id>.<input index>"
// for unnamed or context-dependent menus.
const MENUS: Record<string, Menu> = {
  spriteOrMouse: { options: ["mouse-pointer", SPRITE], round: true },
  location: {
    options: ["random position", "mouse-pointer", SPRITE],
    round: true,
  },
  rotationStyle: { options: ["left-right", "don't rotate", "all around"] },
  costume: { options: ["costume2", "costume1"], round: true },
  backdrop: {
    options: ["backdrop1", "next backdrop", "previous backdrop", "random backdrop"],
    round: true,
  },
  "EVENT_WHENBACKDROPSWITCHESTO.0": { options: ["backdrop1"] },
  effect: {
    options: ["color", "fisheye", "whirl", "pixelate", "mosaic", "brightness", "ghost"],
  },
  "LOOKS_GOTOFRONTBACK.0": { options: ["front", "back"] },
  "LOOKS_GOFORWARDBACKWARDLAYERS.0": { options: ["forward", "backward"] },
  "LOOKS_COSTUMENUMBERNAME.0": { options: ["number", "name"] },
  "LOOKS_BACKDROPNUMBERNAME.0": { options: ["number", "name"] },
  sound: { options: ["Meow"], round: true },
  "SOUND_CHANGEEFFECTBY.0": { options: ["pitch", "pan left/right"] },
  "SOUND_SETEFFECTO.0": { options: ["pitch", "pan left/right"] },
  drum: { options: DRUMS, round: true },
  instrument: { options: INSTRUMENTS, round: true },
  color: {
    options: ["color", "saturation", "brightness", "transparency"],
    round: true,
  },
  key: { options: KEYS, round: true },
  "EVENT_WHENKEYPRESSED.0": { options: KEYS },
  triggerSensor: { options: ["loudness", "timer"] },
  broadcast: { options: ["message1"], round: true },
  "EVENT_WHENBROADCASTRECEIVED.0": { options: ["message1"] },
  stop: { options: ["all", "this script", "other scripts in sprite"] },
  spriteOnly: { options: ["myself", SPRITE], round: true },
  videoState: { options: ["on", "off", "on flipped"], round: true },
  var: { options: ["my variable"] },
  list: { options: ["my list"] },
  touching: { options: ["mouse-pointer", "edge", SPRITE], round: true },
  "SENSING_SETDRAGMODE.0": { options: ["draggable", "not draggable"] },
  videoMotionType: { options: ["motion", "direction"], round: true },
  stageOrThis: { options: ["sprite", "stage"], round: true },
  attribute: {
    options: [
      "backdrop #",
      "backdrop name",
      "volume",
      "x position",
      "y position",
      "direction",
      "costume #",
      "costume name",
      "size",
      "my variable",
    ],
  },
  spriteOrStage: { options: ["Stage", SPRITE], round: true },
  timeAndDate: {
    options: ["year", "month", "date", "day of week", "hour", "minute", "second"],
  },
  mathOp: {
    options: [
      "abs",
      "floor",
      "ceiling",
      "sqrt",
      "sin",
      "cos",
      "tan",
      "asin",
      "acos",
      "atan",
      "ln",
      "log",
      "e ^",
      "10 ^",
    ],
  },
  "faceSensing.goToPart.0": { options: FACE_PARTS, round: true },
  "faceSensing.whenTilted.0": { options: ["left", "right"] },
  "faceSensing.whenSpriteTouchesPart.0": { options: FACE_PARTS },
  "text2speech.setVoiceBlock.0": {
    options: ["alto", "tenor", "squeak", "giant", "kitten"],
    round: true,
  },
  "text2speech.setLanguageBlock.0": {
    options: ["English", "Spanish", "French", "German", "Japanese", "Chinese (Mandarin)"],
    round: true,
  },
  "translate.translateBlock.1": {
    options: ["Spanish", "French", "German", "Japanese", "Chinese (Simplified)"],
    round: true,
  },
  "makeymakey.whenKeyPressed.0": {
    options: ["space", "left", "right", "up", "down", "w", "a", "s", "d", "f", "g"],
  },
  "makeymakey.whenKeysPressedInOrder.0": {
    options: [
      "left up right",
      "right up left",
      "left right",
      "right left",
      "up down",
      "down up",
      "up right down left",
      "up left down right",
      "up up down down left right left right",
    ],
  },
  "microbit.whenButtonPressed.0": { options: ["A", "B", "any"] },
  "microbit.isButtonPressed.0": { options: ["A", "B", "any"], round: true },
  "microbit.whenGesture.0": { options: ["moved", "shaken", "jumped"] },
  "microbit.displaySymbol.0": { options: ["♥"], round: true },
  "microbit.whenTilted.0": { options: ["any", ...TILT4] },
  "microbit.isTilted.0": { options: ["any", ...TILT4], round: true },
  "microbit.tiltAngle.0": { options: TILT4, round: true },
  "microbit.whenPinConnected.0": { options: ["0", "1", "2"] },
  "ev3.motorTurnClockwise.0": { options: ["A", "B", "C", "D"], round: true },
  "ev3.motorTurnCounterClockwise.0": {
    options: ["A", "B", "C", "D"],
    round: true,
  },
  "ev3.motorSetPower.0": { options: ["A", "B", "C", "D"], round: true },
  "ev3.getMotorPosition.0": { options: ["A", "B", "C", "D"], round: true },
  "ev3.whenButtonPressed.0": { options: ["1", "2", "3", "4"] },
  "ev3.buttonPressed.0": { options: ["1", "2", "3", "4"], round: true },
  motor: {
    options: ["motor", "motor A", "motor B", "all motors"],
    round: true,
  },
  motor2: {
    options: ["motor", "motor A", "motor B", "all motors"],
    round: true,
  },
  motorDirection: {
    options: ["this way", "that way", "reverse"],
    round: true,
  },
  lessMore: { options: ["<", ">"] },
  "wedo2.whenTilted.0": { options: ["any", ...TILT_UD] },
  "wedo2.isTilted.0": { options: ["any", ...TILT_UD], round: true },
  "wedo2.getTiltAngle.0": { options: TILT_UD, round: true },
  "gdxfor.whenGesture.0": {
    options: ["shaken", "started falling", "turned over"],
  },
  "gdxfor.whenForcePushedOrPulled.0": { options: ["pushed", "pulled"] },
  "gdxfor.whenTilted.0": { options: ["any", ...TILT4] },
  "gdxfor.isTilted.0": { options: ["any", ...TILT4], round: true },
  "gdxfor.getTilt.0": { options: TILT4, round: true },
  "gdxfor.getSpin.0": { options: ["z", "x", "y"], round: true },
  "gdxfor.getAcceleration.0": { options: ["x", "y", "z"], round: true },
  "boost.motorOnFor.0": { options: BOOST_PORTS(), round: true },
  "boost.motorOnForRotation.0": { options: BOOST_PORTS(), round: true },
  "boost.motorOn.0": { options: BOOST_PORTS(), round: true },
  "boost.motorOff.0": { options: BOOST_PORTS(), round: true },
  "boost.setMotorPower.0": { options: BOOST_PORTS(), round: true },
  "boost.setMotorDirection.0": { options: BOOST_PORTS(), round: true },
  "boost.setMotorDirection.1": {
    options: ["this way", "that way", "reverse"],
    round: true,
  },
  "boost.getMotorPosition.0": { options: ["A", "B", "C", "D"], round: true },
  "boost.whenColor.0": {
    options: ["any color", "red", "blue", "green", "yellow", "white", "black"],
  },
  "boost.seeingColor.0": {
    options: ["any color", "red", "blue", "green", "yellow", "white", "black"],
    round: true,
  },
  "boost.whenTilted.0": { options: ["any", ...TILT_UD] },
  "boost.getTiltAngle.0": { options: TILT_UD, round: true },
};

function BOOST_PORTS() {
  return ["A", "B", "C", "D", "AB", "ABCD"];
}

// Default values for number and text inputs, matching the Scratch palette.
const DEFAULTS: Record<string, string[]> = {
  MOTION_MOVESTEPS: ["10"],
  MOTION_TURNRIGHT: ["15"],
  MOTION_TURNLEFT: ["15"],
  MOTION_POINTINDIRECTION: ["90"],
  MOTION_GOTOXY: ["0", "0"],
  MOTION_GLIDESECSTOXY: ["1", "0", "0"],
  MOTION_GLIDETO: ["1"],
  MOTION_CHANGEXBY: ["10"],
  MOTION_SETX: ["0"],
  MOTION_CHANGEYBY: ["10"],
  MOTION_SETY: ["0"],
  LOOKS_SAYFORSECS: ["Hello!", "2"],
  LOOKS_SAY: ["Hello!"],
  LOOKS_THINKFORSECS: ["Hmm...", "2"],
  LOOKS_THINK: ["Hmm..."],
  LOOKS_CHANGEEFFECTBY: ["", "25"],
  LOOKS_SETEFFECTTO: ["", "0"],
  LOOKS_CHANGESIZEBY: ["10"],
  LOOKS_SETSIZETO: ["100"],
  LOOKS_GOFORWARDBACKWARDLAYERS: ["", "1"],
  SOUND_CHANGEEFFECTBY: ["", "10"],
  SOUND_SETEFFECTO: ["", "100"],
  SOUND_CHANGEVOLUMEBY: ["-10"],
  SOUND_SETVOLUMETO: ["100"],
  "music.playDrumForBeats": ["", "0.25"],
  "music.restForBeats": ["0.25"],
  "music.playNoteForBeats": ["60", "0.25"],
  "music.changeTempo": ["20"],
  "music.setTempo": ["60"],
  "pen.setColor": ["#4a6cd4"],
  "pen.setColorParam": ["", "50"],
  "pen.changeColorParam": ["", "10"],
  "pen.changeSize": ["1"],
  "pen.setSize": ["1"],
  EVENT_WHENGREATERTHAN: ["", "10"],
  CONTROL_WAIT: ["1"],
  CONTROL_REPEAT: ["10"],
  SENSING_ASKANDWAIT: ["What's your name?"],
  SENSING_TOUCHINGCOLOR: ["#4a6cd4"],
  SENSING_COLORISTOUCHINGCOLOR: ["#4a6cd4", "#e6a822"],
  "videoSensing.setVideoTransparency": ["50"],
  "videoSensing.whenMotionGreaterThan": ["10"],
  DATA_SETVARIABLETO: ["", "0"],
  DATA_CHANGEVARIABLEBY: ["", "1"],
  DATA_ADDTOLIST: ["thing"],
  DATA_DELETEOFLIST: ["1"],
  DATA_INSERTATLIST: ["thing", "1"],
  DATA_REPLACEITEMOFLIST: ["1", "", "thing"],
  DATA_ITEMOFLIST: ["1"],
  DATA_ITEMNUMOFLIST: ["thing"],
  DATA_LISTCONTAINSITEM: ["", "thing"],
  OPERATORS_RANDOM: ["1", "10"],
  OPERATORS_LT: ["", "50"],
  OPERATORS_EQUALS: ["", "50"],
  OPERATORS_GT: ["", "50"],
  OPERATORS_JOIN: ["apple ", "banana"],
  OPERATORS_LETTEROF: ["1", "apple"],
  OPERATORS_LENGTH: ["apple"],
  OPERATORS_CONTAINS: ["apple", "a"],
  "text2speech.speakAndWaitBlock": ["hello"],
  "translate.translateBlock": ["hello"],
  "microbit.displayText": ["Hello!"],
  "ev3.motorTurnClockwise": ["", "1"],
  "ev3.motorTurnCounterClockwise": ["", "1"],
  "ev3.motorSetPower": ["", "100"],
  "ev3.whenDistanceLessThan": ["5"],
  "ev3.whenBrightnessLessThan": ["50"],
  "ev3.beepNote": ["60", "0.5"],
  "wedo2.startMotorPower": ["", "100"],
  "wedo2.whenDistance": ["", "50"],
  "wedo2.motorOnFor": ["", "1"],
  "wedo2.setLightHue": ["50"],
  "wedo2.playNoteFor": ["60", "0.5"],
  "boost.motorOnFor": ["", "1"],
  "boost.motorOnForRotation": ["", "1"],
  "boost.setMotorPower": ["", "100"],
  "boost.setLightHue": ["50"],
};

function inputDef(id: string, index: number, type: string): InputDef {
  const given = DEFAULTS[id]?.[index] ?? "";
  if (type === "%n") return { kind: "number", round: true, default: given };
  if (type === "%s") return { kind: "text", round: false, default: given };
  if (type === "%b") return { kind: "boolean", round: false, default: "" };
  if (type === "%c")
    return { kind: "color", round: false, default: given || "#4a6cd4" };
  const name = type.split(".")[1] ?? "";
  // Scratch 3 shows these as plain number slots with no dropdown arrow.
  if (["direction", "note", "listItem", "listDeleteItem"].includes(name)) {
    return { kind: "number", round: true, default: given };
  }
  const menu = MENUS[`${id}.${index}`] ??
    MENUS[name] ?? { options: [], round: true };
  return {
    kind: "menu",
    round: menu.round ?? false,
    default: menu.options[0] ?? "",
    options: menu.options,
  };
}

function labelOf(spec: string, inputs: InputDef[]): string {
  return spec
    .replace(/%(\d+)/g, (_, n) => {
      const input = inputs[Number(n) - 1];
      return input?.kind === "boolean" ? "<>" : `(${input?.default ?? ""})`;
    })
    .replace(/@greenFlag/g, "green flag")
    .replace(/@turnRight/g, "right")
    .replace(/@turnLeft/g, "left");
}

function fromCommands(): BlockDef[] {
  return commands
    .filter(
      (c) =>
        c.id &&
        !EXCLUDED_IDS.has(c.id) &&
        !["obsolete", "grey"].includes(c.category) &&
        !["celse", "cend", "ring"].includes(c.shape),
    )
    .map((c) => {
      const id = c.id as string;
      const inputs = (c.inputs ?? []).map((t, i) => inputDef(id, i, t));
      return {
        key: id,
        category: c.category,
        shape: c.shape,
        spec: c.spec,
        inputs,
        label: labelOf(c.spec, inputs),
      };
    });
}

function textInput(def: string): InputDef {
  return { kind: "text", round: false, default: def };
}

const EXTRA: BlockDef[] = [
  {
    key: "CONTROL_IF_ELSE",
    category: "control",
    shape: "c-block",
    spec: "if %1 then else",
    inputs: [{ kind: "boolean", round: false, default: "" }],
    label: "if <> then else",
    build: () => "if <> then\nelse\nend",
  },
  {
    key: "DATA_VARIABLE",
    category: "variables",
    shape: "reporter",
    spec: "%1",
    inputs: [textInput("my variable")],
    label: "my variable (variable reporter)",
    build: ([name]) => `(${escape(name ?? "")} :: variables)`,
  },
  {
    key: "DATA_LIST",
    category: "list",
    shape: "reporter",
    spec: "%1",
    inputs: [textInput("my list")],
    label: "my list (list reporter)",
    build: ([name]) => `(${escape(name ?? "")} :: list)`,
  },
  {
    key: "PROCEDURES_DEFINITION",
    category: "custom",
    shape: "hat",
    spec: "define %1",
    inputs: [textInput("my block (number) <boolean> label")],
    label: "define block",
    build: ([body]) => `define ${body ?? ""}`,
  },
  {
    key: "PROCEDURES_CALL",
    category: "custom",
    shape: "stack",
    spec: "%1",
    inputs: [textInput("my block (10) <> label")],
    label: "custom block call",
    build: ([body]) => `${body ?? ""} :: custom`,
  },
];

const CATEGORY_ORDER = Object.keys(CATEGORY_NAMES);

function buildCatalog(): BlockDef[] {
  const base = fromCommands();
  const ifIndex = base.findIndex((b) => b.key === "CONTROL_IF");
  base.splice(ifIndex + 1, 0, EXTRA[0] as BlockDef);
  const all = [...EXTRA.slice(1), ...base];
  return all
    .map((b, i) => ({ b, i }))
    .sort(
      (x, y) =>
        CATEGORY_ORDER.indexOf(x.b.category) -
          CATEGORY_ORDER.indexOf(y.b.category) || x.i - y.i,
    )
    .map(({ b }) => b);
}

export const CATALOG = buildCatalog();

function escape(value: string): string {
  return value.replace(/[\\[\]()<>]/g, (ch) => `\\${ch}`);
}

function renderInput(input: InputDef, value: string): string {
  switch (input.kind) {
    case "number":
      return `(${escape(value)})`;
    case "text":
      return `[${escape(value)}]`;
    case "boolean":
      return "<>";
    case "color":
      return `[${value}]`;
    case "menu":
      return input.round
        ? `(${escape(value)} v)`
        : `[${escape(value)} v]`;
  }
}

export function toCode(block: BlockDef, values: string[]): string {
  if (block.build) return block.build(values);
  let body = block.spec.replace(/%(\d+)/g, (_, n) => {
    const i = Number(n) - 1;
    const input = block.inputs[i];
    return input ? renderInput(input, values[i] ?? "") : "";
  });
  if (EXTENSIONS.has(block.category)) body += ` :: ${block.category}`;
  switch (block.shape) {
    case "reporter":
      return `(${body})`;
    case "boolean":
      return `<${body}>`;
    case "c-block":
    case "c-block cap":
      return `${body}\nend`;
    default:
      return body;
  }
}

export function defaultValues(block: BlockDef): string[] {
  return block.inputs.map((i) => i.default);
}
