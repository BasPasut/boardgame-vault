import { Role } from "@/types/game";

export const FIRST_SHADOWS_ROLES: Role[] = [
  // TOWNSFOLK
  {
    id: "laundress",
    name: { en: "Laundress", th: "หญิงซักผ้า" },
    type: "townsfolk",
    team: "good",
    description: {
      en: "You start knowing that one of two players is a particular Townsfolk.",
      th: "คุณรู้ว่าหนึ่งในสองผู้เล่นเป็น Townsfolk ตัวหนึ่ง",
    },
    ability: {
      en: "You start knowing that 1 of 2 players is a [Townsfolk].",
      th: "รู้ว่า 1 ใน 2 คน เป็น [Townsfolk] ตัวหนึ่ง",
    },
    image: "/images/games/shadows-over-thornwick/roles/laundress.png",
    firstNight: 3,
  },
  {
    id: "archivist",
    name: { en: "Archivist", th: "บรรณารักษ์" },
    type: "townsfolk",
    team: "good",
    description: {
      en: "You start knowing that one of two players is a particular Outsider.",
      th: "คุณรู้ว่าหนึ่งในสองผู้เล่นเป็น Outsider ตัวหนึ่ง",
    },
    ability: {
      en: "You start knowing that 1 of 2 players is an [Outsider]. (Or that zero are in play.)",
      th: "รู้ว่า 1 ใน 2 คน เป็น [Outsider] ตัวหนึ่ง หรือ ไม่มี Outsider เลย",
    },
    image: "/images/games/shadows-over-thornwick/roles/archivist.png",
    firstNight: 4,
  },
  {
    id: "inspector",
    name: { en: "Inspector", th: "นักสืบ" },
    type: "townsfolk",
    team: "good",
    description: {
      en: "You start knowing that one of two players is a particular Minion.",
      th: "คุณรู้ว่าหนึ่งในสองผู้เล่นเป็น Minion ตัวหนึ่ง",
    },
    ability: {
      en: "You start knowing that 1 of 2 players is a [Minion].",
      th: "รู้ว่า 1 ใน 2 คน เป็น [Minion] ตัวหนึ่ง",
    },
    image: "/images/games/shadows-over-thornwick/roles/inspector.png",
    firstNight: 5,
  },
  {
    id: "chef",
    name: { en: "Chef", th: "พ่อครัว" },
    type: "townsfolk",
    team: "good",
    description: {
      en: "You start knowing how many pairs of evil players there are.",
      th: "คุณรู้ว่ามีคู่ผู้เล่นฝ่ายชั่วกี่คู่",
    },
    ability: {
      en: "You start knowing how many pairs of evil players there are.",
      th: "รู้ว่ามีกี่คู่ผู้เล่นฝ่ายชั่ว (ที่นั่งติดกัน)",
    },
    image: "/images/games/shadows-over-thornwick/roles/chef.png",
    firstNight: 6,
  },
  {
    id: "empath",
    name: { en: "Empath", th: "ผู้รู้ใจ" },
    type: "townsfolk",
    team: "good",
    description: {
      en: "Each night, you learn how many of your two living neighbours are evil.",
      th: "ทุกคืน คุณรู้ว่าเพื่อนบ้านที่มีชีวิตสองคนเป็นฝ่ายชั่วกี่คน",
    },
    ability: {
      en: "Each night, you learn how many of your 2 alive neighbours are evil.",
      th: "ทุกคืน รู้ว่าเพื่อนบ้านที่มีชีวิตอยู่ 2 คนนั้น เป็นฝ่ายชั่วกี่คน",
    },
    image: "/images/games/shadows-over-thornwick/roles/empath.png",
    firstNight: 7,
    otherNights: 2,
  },
  {
    id: "oracle",
    name: { en: "Oracle", th: "หมอดู" },
    type: "townsfolk",
    team: "good",
    description: {
      en: "Each night, choose two players. You learn if either is the Fiend.",
      th: "ทุกคืน เลือกสองผู้เล่น คุณรู้ว่ามีคนใดเป็น Fiend หรือไม่",
    },
    ability: {
      en: "Each night, choose 2 players: you learn if either is the Fiend. There is a good player that registers as a Fiend to you.",
      th: "ทุกคืน เลือก 2 คน รู้ว่าคนใดเป็น Fiend หรือไม่ มีผู้เล่นฝ่ายดีคนหนึ่งที่แสดงเป็น Fiend สำหรับคุณ",
    },
    image: "/images/games/shadows-over-thornwick/roles/oracle.png",
    firstNight: 8,
    otherNights: 3,
  },
  {
    id: "gravedigger",
    name: { en: "Gravedigger", th: "ผู้ฝังศพ" },
    type: "townsfolk",
    team: "good",
    description: {
      en: "Each night, you learn which role was executed today (if any).",
      th: "ทุกคืน คุณรู้ว่าผู้ที่ถูกประหารในวันนี้มีบทบาทอะไร",
    },
    ability: {
      en: "Each night*, you learn which character was executed today (if any).",
      th: "ทุกคืน* รู้ว่าผู้ที่ถูกประหารวันนี้เล่นบทบาทอะไร",
    },
    image: "/images/games/shadows-over-thornwick/roles/gravedigger.png",
    otherNights: 4,
  },
  {
    id: "friar",
    name: { en: "Friar", th: "พระ" },
    type: "townsfolk",
    team: "good",
    description: {
      en: "Each night, choose a player. They are safe from the Fiend tonight.",
      th: "ทุกคืน เลือกผู้เล่นหนึ่งคน พวกเขาปลอดภัยจาก Fiend คืนนี้",
    },
    ability: {
      en: "Each night*, choose a player (not yourself): they are safe from the Fiend tonight.",
      th: "ทุกคืน* เลือกผู้เล่น 1 คน (ไม่ใช่ตัวเอง): ปลอดภัยจาก Fiend คืนนี้",
    },
    image: "/images/games/shadows-over-thornwick/roles/friar.png",
    otherNights: 5,
  },
  {
    id: "crow-warden",
    name: { en: "Crow Warden", th: "ผู้เลี้ยงอีกา" },
    type: "townsfolk",
    team: "good",
    description: {
      en: "If you die at night, you learn the character of a player of your choice.",
      th: "หากคุณตายในตอนกลางคืน คุณจะรู้บทบาทของผู้เล่นที่คุณเลือก",
    },
    ability: {
      en: "If you die at night, you are woken to choose a player: you learn their character.",
      th: "ถ้าคุณตายตอนกลางคืน ตื่นขึ้นเลือกผู้เล่น 1 คน แล้วรู้บทบาทของเขา",
    },
    image: "/images/games/shadows-over-thornwick/roles/crow-warden.png",
    otherNights: 6,
  },
  {
    id: "innocent",
    name: { en: "Innocent", th: "สาวบริสุทธิ์" },
    type: "townsfolk",
    team: "good",
    description: {
      en: "The first time you are nominated, if the nominator is a Townsfolk, they are executed immediately.",
      th: "ครั้งแรกที่คุณถูกเสนอชื่อ ถ้าผู้เสนอเป็น Townsfolk พวกเขาจะถูกประหารทันที",
    },
    ability: {
      en: "The 1st time you are nominated, if the nominator is a Townsfolk, they are immediately executed.",
      th: "ครั้งแรกที่ถูกเสนอชื่อ ถ้าผู้เสนอเป็น Townsfolk จะถูกประหารทันที",
    },
    image: "/images/games/shadows-over-thornwick/roles/innocent.png",
  },
  {
    id: "witch-hunter",
    name: { en: "Witch Hunter", th: "นักล่าแม่มด" },
    type: "townsfolk",
    team: "good",
    description: {
      en: "Once per game, during the day, publicly choose a player. If they are the Fiend, they die.",
      th: "ครั้งหนึ่งต่อเกม ในช่วงกลางวัน ประกาศต่อสาธารณะเพื่อสังหารผู้เล่น ถ้าเป็น Fiend พวกเขาตาย",
    },
    ability: {
      en: "Once per game, during the day, publicly choose a player: if they are the Fiend, they die.",
      th: "ครั้งเดียวต่อเกม กลางวัน เลือกผู้เล่น 1 คนต่อหน้าสาธารณะ: ถ้าเป็น Fiend จะตาย",
    },
    image: "/images/games/shadows-over-thornwick/roles/witch-hunter.png",
  },
  {
    id: "guard",
    name: { en: "Guard", th: "ทหารยาม" },
    type: "townsfolk",
    team: "good",
    description: {
      en: "You are safe from the Fiend.",
      th: "คุณปลอดภัยจาก Fiend",
    },
    ability: {
      en: "You are safe from the Fiend.",
      th: "ปลอดภัยจาก Fiend",
    },
    image: "/images/games/shadows-over-thornwick/roles/guard.png",
  },
  {
    id: "elder",
    name: { en: "Elder", th: "ผู้อาวุโส" },
    type: "townsfolk",
    team: "good",
    description: {
      en: "If only 3 players live and no execution occurs, your team wins. If you die at night, another player might die instead.",
      th: "หากเหลือ 3 คนและไม่มีการประหาร ทีมของคุณชนะ",
    },
    ability: {
      en: "If only 3 players live & no execution occurs, your team wins. If you die at night, another player might die instead.",
      th: "ถ้าเหลือ 3 คน และไม่มีการประหาร ทีมดีชนะ ถ้าคุณตายตอนกลางคืน ผู้เล่นอื่นอาจตายแทน",
    },
    image: "/images/games/shadows-over-thornwick/roles/elder.png",
  },

  // OUTSIDERS
  {
    id: "manservant",
    name: { en: "Manservant", th: "คนรับใช้" },
    type: "outsider",
    team: "good",
    description: {
      en: "Each night, choose a player (your master). You may only vote if they are voting too.",
      th: "ทุกคืน เลือกผู้เล่น (เจ้านายของคุณ) คุณโหวตได้เฉพาะเมื่อเจ้านายโหวตด้วย",
    },
    ability: {
      en: "Each night, choose a player (not yourself): tomorrow, you may only vote if they are voting too.",
      th: "ทุกคืน เลือกผู้เล่น 1 คน (ไม่ใช่ตัวเอง): พรุ่งนี้โหวตได้เฉพาะเมื่อเขาโหวตด้วย",
    },
    image: "/images/games/shadows-over-thornwick/roles/manservant.png",
    firstNight: 9,
    otherNights: 7,
  },
  {
    id: "fool",
    name: { en: "Fool", th: "คนเมา" },
    type: "outsider",
    team: "good",
    description: {
      en: "You do not know you are the Fool. You think you are a Townsfolk but your ability malfunctions.",
      th: "คุณไม่รู้ว่าตัวเองเป็น Fool คุณคิดว่าเป็น Townsfolk แต่ความสามารถทำงานผิดพลาด",
    },
    ability: {
      en: "You do not know you are the Fool. You think you are a Townsfolk character, but your ability malfunctions.",
      th: "ไม่รู้ว่าตัวเองเป็น Fool คิดว่าเป็น Townsfolk แต่ความสามารถทำงานผิดพลาด",
    },
    image: "/images/games/shadows-over-thornwick/roles/fool.png",
  },
  {
    id: "hermit",
    name: { en: "Hermit", th: "ฤาษี" },
    type: "outsider",
    team: "good",
    description: {
      en: "You might register as evil and as a Minion or Fiend, even if dead.",
      th: "คุณอาจถูกตรวจจับว่าเป็นฝ่ายชั่วหรือ Minion หรือ Fiend แม้แต่ตายแล้ว",
    },
    ability: {
      en: "You might register as evil & as a Minion or Fiend, even if dead.",
      th: "อาจถูกตรวจจับว่าเป็นฝ่ายชั่ว หรือเป็น Minion/Fiend แม้ตายแล้ว",
    },
    image: "/images/games/shadows-over-thornwick/roles/hermit.png",
  },
  {
    id: "martyr",
    name: { en: "Martyr", th: "นักบุญ" },
    type: "outsider",
    team: "good",
    description: {
      en: "If you are executed, your team loses.",
      th: "หากคุณถูกประหาร ทีมของคุณแพ้",
    },
    ability: {
      en: "If you die by execution, your team loses.",
      th: "ถ้าคุณถูกประหาร ทีมดีแพ้",
    },
    image: "/images/games/shadows-over-thornwick/roles/martyr.png",
  },

  // MINIONS
  {
    id: "alchemist",
    name: { en: "Alchemist", th: "นักเล่นแร่แปรธาตุ" },
    type: "minion",
    team: "evil",
    description: {
      en: "Each night, choose a player. Their ability is poisoned tonight and tomorrow day.",
      th: "ทุกคืน เลือกผู้เล่น ความสามารถของพวกเขาถูกวางยาคืนนี้และวันพรุ่งนี้",
    },
    ability: {
      en: "Each night, choose a player: they are poisoned tonight and tomorrow day.",
      th: "ทุกคืน เลือกผู้เล่น 1 คน: พวกเขาถูกวางยาคืนนี้และพรุ่งนี้",
    },
    image: "/images/games/shadows-over-thornwick/roles/alchemist.png",
    firstNight: 2,
    otherNights: 1,
  },
  {
    id: "infiltrator",
    name: { en: "Infiltrator", th: "สายลับ" },
    type: "minion",
    team: "evil",
    description: {
      en: "Each night, you see the Grimoire. You might register as good and as a Townsfolk or Outsider.",
      th: "ทุกคืน คุณเห็น Grimoire คุณอาจถูกตรวจจับว่าเป็นฝ่ายดีหรือ Townsfolk/Outsider",
    },
    ability: {
      en: "Each night, you see the Grimoire. You might register as good & as a Townsfolk or Outsider, even if dead.",
      th: "ทุกคืน เห็น Grimoire อาจถูกตรวจจับว่าเป็นฝ่ายดี หรือ Townsfolk/Outsider แม้ตายแล้ว",
    },
    image: "/images/games/shadows-over-thornwick/roles/infiltrator.png",
    firstNight: 12,
    otherNights: 10,
  },
  {
    id: "shadow-mistress",
    name: { en: "Shadow Mistress", th: "นางเงา" },
    type: "minion",
    team: "evil",
    description: {
      en: "If there are 5+ players alive and the Fiend dies, you become the Fiend.",
      th: "หากมีผู้เล่น 5+ คนที่มีชีวิตอยู่และ Fiend ตาย คุณจะกลายเป็น Fiend",
    },
    ability: {
      en: "If there are 5 or more players alive & the Fiend dies, you become the Fiend.",
      th: "ถ้ามีผู้เล่น 5+ คนมีชีวิต และ Fiend ตาย คุณกลายเป็น Fiend",
    },
    image: "/images/games/shadows-over-thornwick/roles/shadow-mistress.png",
    otherNights: 11,
  },
  {
    id: "lord",
    name: { en: "Lord", th: "ขุนนาง" },
    type: "minion",
    team: "evil",
    description: {
      en: "There are extra Outsiders in this game.",
      th: "มี Outsider เพิ่มขึ้นในเกมนี้",
    },
    ability: {
      en: "There are extra Outsiders in play. [+2 Outsiders]",
      th: "มี Outsider เพิ่มขึ้น [+2 Outsiders]",
    },
    image: "/images/games/shadows-over-thornwick/roles/lord.png",
  },

  // DEMON
  {
    id: "fiend",
    name: { en: "Fiend", th: "ปีศาจ" },
    type: "demon",
    team: "evil",
    description: {
      en: "Each night, choose a player. They die. If you kill yourself, a Minion becomes the Fiend.",
      th: "ทุกคืน เลือกผู้เล่น พวกเขาตาย ถ้าคุณฆ่าตัวเอง Minion จะกลายเป็น Fiend",
    },
    ability: {
      en: "Each night*, choose a player: they die. If you kill yourself this way, a living Minion becomes the Fiend.",
      th: "ทุกคืน* เลือกผู้เล่น 1 คน: เขาตาย ถ้าคุณฆ่าตัวเอง Minion ที่มีชีวิตจะกลายเป็น Fiend",
    },
    image: "/images/games/shadows-over-thornwick/roles/fiend.png",
    firstNight: 13,
    otherNights: 8,
  },
];

export const getRoleById = (id: string): Role | undefined =>
  FIRST_SHADOWS_ROLES.find((r) => r.id === id);

export const getRolesByType = (type: Role["type"]): Role[] =>
  FIRST_SHADOWS_ROLES.filter((r) => r.type === type);
