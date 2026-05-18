"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { getLang, saveLang } from "@/lib/utils/lang";
import { FIRST_SHADOWS_ROLES } from "@/lib/games/shadows-over-thornwick/roles";
import type { Role } from "@/types/game";
import { Suspense } from "react";

// RoleCard has no local state — useState is used by GuideContent for lang toggle

// ---------- Content per game ----------
const GUIDES: Record<string, {
  name: { en: string; th: string };
  cover: string | null;
  players: string;
  hostLabel?: { en: string; th: string };
  tagline: { en: string; th: string };
  overview: { en: string; th: string };
  winConditions?: { icon: string; color: string; borderColor: string; title: { en: string; th: string }; body: { en: string; th: string } }[];
  gameFlow: { icon: string; label: { en: string; th: string } }[];
  gameFlowNote?: { en: string; th: string };
  phases?: { titleKey: string; title: { en: string; th: string }; steps: { en: string[]; th: string[] }; accent: string }[];
  rules: { title: { en: string; th: string }; items: { en: { icon: string; title: string; body: string }[]; th: { icon: string; title: string; body: string }[] } };
  scoring?: { rings: { label: { en: string; th: string }; pts: string; cueGiver: string; color: string }[]; note: { en: string; th: string } };
  roles?: Role[];
}> = {
  "shadows-over-thornwick": {
    name: { en: "Shadows Over Thornwick", th: "Shadows Over Thornwick" },
    cover: "/images/games/shadows-over-thornwick/cover.png",
    players: "5–15",
    hostLabel: { en: "Storyteller", th: "Storyteller" },
    tagline: {
      en: "A social deduction game of murder and mystery in the cursed village of Thornwick.",
      th: "เกมสืบสวนสังคมแห่งการฆาตกรรมและความลึกลับในหมู่บ้านต้องสาป ธอร์นวิค",
    },
    overview: {
      en: "One player is the Storyteller — neutral, all-knowing, and in control of the game. The rest are secret villagers of Thornwick, divided between Good and Evil. No one knows who is who. Through discussion, deduction, and deception, the village must find and execute the Demon before it kills everyone.",
      th: "ผู้เล่นหนึ่งคนเป็น Storyteller ที่เป็นกลาง รู้ทุกอย่าง และควบคุมเกม ส่วนที่เหลือเป็นชาวหมู่บ้านธอร์นวิคที่แบ่งเป็นฝ่ายดีและฝ่ายชั่วอย่างลับๆ ไม่มีใครรู้ว่าใครเป็นใคร ผ่านการถกเถียง อนุมาน และการหลอกลวง หมู่บ้านต้องหาและประหารปีศาจก่อนที่มันจะฆ่าทุกคน",
    },
    winConditions: [
      {
        icon: "☀️",
        color: "#80b0ff",
        borderColor: "rgba(74,111,165,0.3)",
        title: { en: "Good Wins", th: "ฝ่ายดีชนะ" },
        body: { en: "Execute the Demon. When the Demon is voted out and executed during the day, the village wins immediately.", th: "ประหาร Demon เมื่อ Demon ถูกโหวตและประหารในตอนกลางวัน หมู่บ้านชนะทันที" },
      },
      {
        icon: "😈",
        color: "#ff8080",
        borderColor: "rgba(139,26,26,0.3)",
        title: { en: "Evil Wins", th: "ฝ่ายชั่วชนะ" },
        body: { en: "Only 2 players remain alive (including the Demon). When the village shrinks to 2 survivors, the Demon's grip is unbreakable.", th: "เหลือผู้เล่นมีชีวิตเพียง 2 คน (รวม Demon) เมื่อหมู่บ้านเหลือผู้รอดชีวิต 2 คน Demon ชนะ" },
      },
    ],
    gameFlow: [
      { icon: "🏰", label: { en: "Lobby", th: "ห้องรอ" } },
      { icon: "🎴", label: { en: "Role Reveal", th: "เปิดบทบาท" } },
      { icon: "☀️", label: { en: "Day", th: "กลางวัน" } },
      { icon: "🌙", label: { en: "Night", th: "กลางคืน" } },
      { icon: "🏆", label: { en: "Victory", th: "ชนะ" } },
    ],
    gameFlowNote: { en: "Day and Night repeat until Good or Evil wins", th: "กลางวันและกลางคืนวนซ้ำจนกว่าฝ่ายใดฝ่ายหนึ่งจะชนะ" },
    phases: [
      {
        titleKey: "day",
        title: { en: "Day Phase ☀️", th: "ช่วงกลางวัน ☀️" },
        accent: "rgba(212,175,55,0.15)",
        steps: {
          en: [
            "The Storyteller announces who died last night.",
            "Everyone discusses freely — share clues, accuse others, or stay quiet.",
            "Any player can nominate someone for execution. The nominee must agree, and at least one other player must second it.",
            "All living players vote publicly. Majority wins — the most-voted player is executed.",
            "Only one execution per day. Choose wisely.",
            "If the executed player is the Demon — Good wins! 🎉",
          ],
          th: [
            "Storyteller ประกาศว่าใครตายเมื่อคืน",
            "ทุกคนพูดคุยได้อย่างเสรี แชร์เบาะแส กล่าวหาผู้อื่น หรือนิ่งเงียบ",
            "ผู้เล่นใดก็ได้สามารถเสนอชื่อคนอื่นเพื่อประหาร ผู้ถูกเสนอต้องยินยอม และต้องมีคนเห็นด้วยอีก 1 คน",
            "ผู้เล่นที่มีชีวิตทุกคนโหวตต่อหน้าสาธารณะ เสียงข้างมากชนะ ผู้ได้รับคะแนนโหวตสูงสุดถูกประหาร",
            "ประหารได้แค่ครั้งเดียวต่อวัน เลือกให้ดี",
            "ถ้าผู้ถูกประหารคือ Demon — ฝ่ายดีชนะ! 🎉",
          ],
        },
      },
      {
        titleKey: "night",
        title: { en: "Night Phase 🌙", th: "ช่วงกลางคืน 🌙" },
        accent: "rgba(45,27,78,0.4)",
        steps: {
          en: [
            "Everyone closes their eyes. The village falls silent.",
            "The Storyteller wakes each role one by one in order (shown in the app).",
            "Evil roles act first — the Demon secretly chooses who to kill tonight.",
            "Information roles receive clues — a number, a name, a yes/no answer from the Storyteller.",
            "Everyone opens their eyes at dawn. The Storyteller announces who died.",
            "The day begins again.",
          ],
          th: [
            "ทุกคนหลับตา หมู่บ้านเงียบสงัด",
            "Storyteller ปลุกแต่ละ role ทีละคนตามลำดับ (แสดงในแอป)",
            "บทบาทฝ่ายชั่วทำก่อน — Demon เลือกลับๆ ว่าจะฆ่าใครคืนนี้",
            "บทบาทที่ได้ข้อมูลจะรับเบาะแส — ตัวเลข ชื่อ หรือคำตอบใช่/ไม่ใช่ จาก Storyteller",
            "ทุกคนลืมตาเมื่อรุ่งเช้า Storyteller ประกาศว่าใครตาย",
            "วันใหม่เริ่มต้นอีกครั้ง",
          ],
        },
      },
    ],
    rules: {
      title: { en: "Key Rules", th: "กฎสำคัญ" },
      items: {
        en: [
          { icon: "💀", title: "Dead players can still talk", body: "Dead players may speak during the day and offer opinions, but they cannot vote or nominate — except they get one final vote they can use any day after death." },
          { icon: "🗳️", title: "One execution per day", body: "No matter how many nominations happen, only the player with the most votes (if majority) is executed. Ties result in no execution." },
          { icon: "🌙", title: "Night actions are secret", body: "All night communication happens privately via DM to the Storyteller. Never reveal what the Storyteller told you directly — describe it in your own words during the day." },
          { icon: "🍺", title: "Drunk & Poisoned players", body: "Some abilities (Fool, Alchemist) cause players to receive false information. You may think you have a useful clue when it's actually wrong. Don't trust everything blindly." },
          { icon: "📖", title: "The Storyteller never lies", body: "The Storyteller follows the rules exactly. However, some roles cause the Storyteller to give false information — so bad info isn't the Storyteller cheating, it's part of the game." },
        ],
        th: [
          { icon: "💀", title: "ผู้ตายยังพูดได้", body: "ผู้เล่นที่ตายแล้วสามารถพูดและแสดงความคิดเห็นในตอนกลางวันได้ แต่โหวตหรือเสนอชื่อไม่ได้ ยกเว้นมีสิทธิ์โหวตครั้งสุดท้ายที่ใช้ได้ในวันใดก็ได้หลังจากตาย" },
          { icon: "🗳️", title: "ประหารได้แค่ครั้งเดียวต่อวัน", body: "ไม่ว่าจะมีการเสนอชื่อกี่ครั้ง มีเพียงผู้ที่ได้คะแนนโหวตสูงสุด (ถ้าเกินครึ่ง) ที่ถูกประหาร ถ้าเสมอกัน ไม่มีการประหาร" },
          { icon: "🌙", title: "การกระทำกลางคืนเป็นความลับ", body: "การสื่อสารกลางคืนทั้งหมดเกิดขึ้นผ่าน DM กับ Storyteller อย่าเปิดเผยสิ่งที่ Storyteller บอกตรงๆ ให้อธิบายด้วยคำพูดของตัวเองในตอนกลางวัน" },
          { icon: "🍺", title: "ผู้เล่นที่เมาและถูกวางยา", body: "ความสามารถบางอย่าง (Fool, Alchemist) ทำให้ผู้เล่นได้รับข้อมูลผิดพลาด คุณอาจคิดว่ามีเบาะแสที่มีประโยชน์ แต่จริงๆ แล้วผิด อย่าเชื่อทุกอย่างโดยไม่ตั้งคำถาม" },
          { icon: "📖", title: "Storyteller ไม่โกหก", body: "Storyteller ปฏิบัติตามกฎอย่างเคร่งครัด แต่บทบาทบางตัวทำให้ Storyteller ต้องให้ข้อมูลผิดพลาด ดังนั้นข้อมูลที่ผิดไม่ใช่การโกง แต่เป็นส่วนหนึ่งของเกม" },
        ],
      },
    },
    roles: FIRST_SHADOWS_ROLES,
  },

  "hues-and-cues": {
    name: { en: "Hues & Cues", th: "Hues & Cues" },
    cover: "/images/games/hues-and-cues/cover.png",
    players: "3–10",
    hostLabel: { en: "Host", th: "Host" },
    tagline: {
      en: "Describe a color in one word. Can your friends find the exact hue?",
      th: "อธิบายสีด้วยคำเดียว เพื่อนจะหาสีที่ถูกต้องได้มั้ย?",
    },
    overview: {
      en: "Everyone takes turns being the Cue Giver — the player who secretly looks at a target color on the 30×16 grid and describes it using only one or two words. The rest of the players try to place their pin on the exact matching color. The closer you guess, the more points you earn!",
      th: "ทุกคนผลัดกันเป็น Cue Giver — ผู้เล่นที่มองสีเป้าหมายบนกริด 30×16 แบบลับๆ แล้วอธิบายด้วยคำ 1-2 คำ ผู้เล่นที่เหลือพยายามวางหมุดบนสีที่ตรงกัน ยิ่งเดาใกล้ ยิ่งได้คะแนนมาก!",
    },
    winConditions: [
      {
        icon: "🎯",
        color: "#d4af37",
        borderColor: "rgba(212,175,55,0.3)",
        title: { en: "Reach the Goal", th: "ถึงเป้าหมาย" },
        body: { en: "The first player to reach the score goal (set before the game) wins. Default is 25 points.", th: "ผู้เล่นคนแรกที่ได้คะแนนถึงเป้าหมาย (กำหนดก่อนเกม) ชนะ ค่าเริ่มต้นคือ 25 คะแนน" },
      },
      {
        icon: "🎨",
        color: "#ec4899",
        borderColor: "rgba(236,72,153,0.3)",
        title: { en: "Most Points", th: "คะแนนสูงสุด" },
        body: { en: "If no one reaches the goal, the player with the highest score at the end wins.", th: "ถ้าไม่มีใครถึงเป้าหมาย ผู้เล่นที่มีคะแนนสูงสุดในท้ายสุดชนะ" },
      },
    ],
    gameFlow: [
      { icon: "🏰", label: { en: "Lobby", th: "ห้องรอ" } },
      { icon: "🎨", label: { en: "Give Clue", th: "ให้ Clue" } },
      { icon: "📍", label: { en: "Everyone Guesses", th: "ทุกคนเดา" } },
      { icon: "✨", label: { en: "Reveal", th: "เฉลย" } },
      { icon: "🏆", label: { en: "Winner!", th: "ผู้ชนะ!" } },
    ],
    gameFlowNote: { en: "Rounds repeat, rotating the Cue Giver, until someone reaches the score goal", th: "รอบวนซ้ำ สลับผู้ให้ Clue จนกว่าจะมีผู้ชนะ" },
    phases: [
      {
        titleKey: "cue",
        title: { en: "Cue Giver's Turn 🎨", th: "ตาของ Cue Giver 🎨" },
        accent: "rgba(212,175,55,0.15)",
        steps: {
          en: [
            "The Cue Giver secretly sees the target square highlighted on the color grid.",
            "Give one word to describe the color (e.g. 'ocean', 'grass', 'blood').",
            "If needed, add a second word clue to help narrow it down.",
            "Once submitted, everyone can see the clue and start guessing.",
          ],
          th: [
            "Cue Giver เห็นตารางเป้าหมายที่ถูกไฮไลต์บนกริดสี",
            "ให้คำ 1 คำอธิบายสี (เช่น 'ทะเล', 'หญ้า', 'เลือด')",
            "ถ้าต้องการ เพิ่ม Clue คำที่สองเพื่อช่วยบอกใบ้",
            "เมื่อส่งแล้ว ทุกคนจะเห็น Clue และเริ่มเดาได้",
          ],
        },
      },
      {
        titleKey: "guess",
        title: { en: "Guessing Phase 📍", th: "ช่วงเดาสี 📍" },
        accent: "rgba(236,72,153,0.1)",
        steps: {
          en: [
            "All players (except the Cue Giver) tap any square on the grid to place their pin.",
            "You can change your guess any time before the reveal.",
            "The Cue Giver can see how many players have guessed and trigger the reveal whenever ready.",
            "The reveal happens automatically when everyone has guessed.",
          ],
          th: [
            "ผู้เล่นทุกคน (ยกเว้น Cue Giver) แตะช่องบนกริดเพื่อวางหมุด",
            "เปลี่ยนคำตอบได้ตลอดก่อนเฉลย",
            "Cue Giver เห็นว่ามีกี่คนทายแล้ว และกดเฉลยได้ตลอดเวลา",
            "เฉลยอัตโนมัติเมื่อทุกคนทายครบ",
          ],
        },
      },
    ],
    scoring: {
      rings: [
        { label: { en: "Bullseye (exact)", th: "ตรงสีพอดี" }, pts: "3", cueGiver: "1", color: "#d4af37" },
        { label: { en: "Ring 1 (1–2 away)", th: "แหวน 1 (ห่าง 1–2)" }, pts: "2", cueGiver: "1", color: "#a0c880" },
        { label: { en: "Ring 2 (3–4 away)", th: "แหวน 2 (ห่าง 3–4)" }, pts: "1", cueGiver: "1", color: "#7a8aa0" },
        { label: { en: "Outside (5+)", th: "นอกแหวน (ห่าง 5+)" }, pts: "0", cueGiver: "0", color: "#4a3a2a" },
      ],
      note: {
        en: "Distance is measured as Manhattan distance (horizontal + vertical squares apart).",
        th: "ระยะทางวัดแบบ Manhattan (ช่องแนวนอน + แนวตั้ง)",
      },
    },
    rules: {
      title: { en: "Key Rules", th: "กฎสำคัญ" },
      items: {
        en: [
          { icon: "🗣️", title: "One or two words only", body: "The Cue Giver may give up to 2 clue words per round. A 'word' can be a hyphenated compound (like 'fire-truck') but not a full phrase or sentence." },
          { icon: "🎯", title: "No pointing or hinting", body: "The Cue Giver cannot gesture, look at, or hint toward the grid while others are guessing. Words only!" },
          { icon: "🔄", title: "Rotate each round", body: "The role of Cue Giver rotates every round in a randomly shuffled order, ensuring everyone gets their turn." },
          { icon: "📍", title: "Change your guess", body: "You can move your pin as many times as you like until the Cue Giver triggers the reveal. Once revealed, it's locked." },
          { icon: "🏆", title: "Win condition", body: "The game ends immediately when a player reaches the score goal. If multiple players reach it in the same reveal, the highest score wins." },
        ],
        th: [
          { icon: "🗣️", title: "คำ 1-2 คำเท่านั้น", body: "Cue Giver สามารถให้ Clue ได้สูงสุด 2 คำต่อรอบ 'คำ' อาจเป็นคำประสม (เช่น 'ไฟ-แดง') แต่ไม่ใช่วลีหรือประโยค" },
          { icon: "🎯", title: "ห้ามชี้หรือบอกใบ้", body: "Cue Giver ห้ามทำท่าทาง มองไปที่ หรือบอกใบ้ตำแหน่งบนกริดขณะที่คนอื่นกำลังเดา ใช้คำเท่านั้น!" },
          { icon: "🔄", title: "สลับกันทุกรอบ", body: "บทบาท Cue Giver หมุนเวียนทุกรอบตามลำดับที่สุ่มไว้ เพื่อให้ทุกคนได้ผลัดกัน" },
          { icon: "📍", title: "เปลี่ยนคำตอบได้", body: "เลื่อนหมุดได้กี่ครั้งก็ได้ก่อนที่ Cue Giver จะกดเฉลย เมื่อเฉลยแล้วจะล็อคทันที" },
          { icon: "🏆", title: "เงื่อนไขชนะ", body: "เกมจบทันทีเมื่อผู้เล่นถึงเป้าหมายคะแนน ถ้าหลายคนถึงพร้อมกันในรอบเดียว ผู้ที่ได้คะแนนสูงกว่าชนะ" },
        ],
      },
    },
  },
};

const TYPE_META = {
  townsfolk: {
    label: { en: "Townsfolk", th: "ทาวน์สโฟล์ค" },
    color: "#80b0ff",
    bg: "rgba(74,111,165,0.15)",
    border: "rgba(74,111,165,0.4)",
    icon: "👥",
    desc: {
      en: "The backbone of Good. Each has an ability that provides information to help identify the evil team. Share what you learn.",
      th: "กระดูกสันหลังของฝ่ายดี แต่ละคนมีความสามารถที่ให้ข้อมูลเพื่อช่วยระบุฝ่ายชั่ว แชร์สิ่งที่คุณรู้ให้ทีม",
    },
  },
  outsider: {
    label: { en: "Outsider", th: "เอาท์ไซเดอร์" },
    color: "#c0a0ff",
    bg: "rgba(120,80,200,0.15)",
    border: "rgba(120,80,200,0.4)",
    icon: "🃏",
    desc: {
      en: "On the Good team, but their unusual abilities often hinder the village. Be careful — they may spread confusion unintentionally.",
      th: "อยู่ในทีมดี แต่ความสามารถพิเศษของพวกเขามักสร้างความสับสนให้หมู่บ้าน ระวัง — พวกเขาอาจสร้างความสับสนโดยไม่ตั้งใจ",
    },
  },
  minion: {
    label: { en: "Minion", th: "มิเนียน" },
    color: "#ffb080",
    bg: "rgba(180,100,30,0.15)",
    border: "rgba(180,100,30,0.4)",
    icon: "👁️",
    desc: {
      en: "Servants of the Demon. They know who the Demon is from the start and work to protect it. Dangerous and deceptive.",
      th: "ผู้รับใช้ของ Demon รู้ว่าใครเป็น Demon ตั้งแต่ต้น และทำงานเพื่อปกป้องมัน อันตรายและหลอกลวง",
    },
  },
  demon: {
    label: { en: "Demon", th: "เดมอน" },
    color: "#ff6060",
    bg: "rgba(139,26,26,0.2)",
    border: "rgba(139,26,26,0.5)",
    icon: "😈",
    desc: {
      en: "The ultimate evil. Kills one villager each night. Blend in, mislead, and survive long enough for only 2 players to remain.",
      th: "ความชั่วร้ายสูงสุด ฆ่าชาวบ้านหนึ่งคนทุกคืน กลมกลืน หลอกลวง และอยู่รอดจนเหลือผู้เล่นเพียง 2 คน",
    },
  },
};

function RoleCard({ role, lang }: { role: Role; lang: "en" | "th" }) {
  const meta = TYPE_META[role.type as keyof typeof TYPE_META];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
      {/* Role image */}
      <div className="relative h-40 w-full" style={{ background: "rgba(0,0,0,0.3)" }}>
        <Image src={role.image} alt={role.name[lang]} fill className="object-cover object-top" onError={() => {}} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)" }} />
        <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
          <div className="text-base font-bold leading-tight" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>
            {role.name[lang]}
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
            {meta.label[lang]}
          </span>
        </div>
      </div>

      {/* Ability */}
      <div className="px-4 py-3">
        <p className="text-sm leading-relaxed font-medium" style={{ color: "#c0a878" }}>
          {role.ability[lang]}
        </p>
      </div>
    </div>
  );
}

function GuideContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const gameId = params.gameId as string;
  const fromSession = searchParams.get("from");
  const guide = GUIDES[gameId];
  const [lang, setLangState] = useState<"en" | "th">(() => getLang());
  const setLang = (l: "en" | "th") => { setLangState(l); saveLang(l); };

  if (!guide) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 70%)" }}>
        <div className="text-center gothic-card rounded-2xl p-10 max-w-sm">
          <div className="text-5xl mb-4">📖</div>
          <h2 className="text-2xl font-black mb-3" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>Guide not found</h2>
          <Link href="/" className="btn-gothic-primary px-6 py-3 rounded-xl font-semibold no-underline">← Home</Link>
        </div>
      </div>
    );
  }

  const rolesByType = guide.roles ? {
    townsfolk: guide.roles.filter((r) => r.type === "townsfolk"),
    outsider: guide.roles.filter((r) => r.type === "outsider"),
    minion: guide.roles.filter((r) => r.type === "minion"),
    demon: guide.roles.filter((r) => r.type === "demon"),
  } : null;

  return (
    <div className="min-h-screen" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 60%)" }}>

      {/* Hero */}
      <div className="relative h-64 md:h-80 w-full overflow-hidden" style={!guide.cover ? { background: "linear-gradient(135deg, #1a0540 0%, #0d1a3a 40%, #1a0a1a 100%)" } : {}}>
        {guide.cover && <Image src={guide.cover} alt={guide.name[lang]} fill className="object-cover opacity-50" />}
        {!guide.cover && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-9xl opacity-10">🎨</div>
          </div>
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(13,10,26,0.3), #1a0a2e)" }} />
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 px-6 text-center">
          <h1 className="text-3xl md:text-5xl font-black mb-2" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>
            {guide.name[lang]}
          </h1>
          <p className="text-sm md:text-base max-w-lg" style={{ color: "#7a6a5a" }}>{guide.tagline[lang]}</p>
        </div>
      </div>

      {/* Nav strip */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-3" style={{ background: "rgba(13,10,26,0.95)", borderBottom: "1px solid rgba(212,175,55,0.15)" }}>
        <Link href={fromSession ? `/session/${fromSession}` : "/"} className="btn-gothic-secondary px-4 py-2 rounded-lg text-sm no-underline">
          ← {fromSession ? (lang === "en" ? "Back" : "กลับ") : (lang === "en" ? "Home" : "หน้าแรก")}
        </Link>
        <span className="text-xs tracking-widest uppercase" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
          {lang === "en" ? "How to Play" : "วิธีเล่น"}
        </span>
        <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-4 py-2 rounded-lg text-sm">
          <span style={{color: lang==="en" ? "#d4af37" : "#5a4a3a"}}>EN</span><span style={{color:"#3a2a1a"}}> / </span><span style={{color: lang==="th" ? "#d4af37" : "#5a4a3a"}}>TH</span>
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-12">

        {/* Overview */}
        <section>
          <SectionTitle en="Overview" th="ภาพรวม" lang={lang} />
          <div className="gothic-card rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">🎲</span>
              <div>
                <div className="text-xs tracking-widest uppercase" style={{ color: "#d4af37" }}>{lang === "en" ? "Players" : "ผู้เล่น"}</div>
                <div className="font-bold" style={{ color: "#e8d5b0" }}>
                  {guide.players} {lang === "en" ? "players" : "คน"}
                  {guide.hostLabel && ` + 1 ${guide.hostLabel[lang]}`}
                </div>
              </div>
            </div>
            <p className="leading-relaxed" style={{ color: "#a08060" }}>{guide.overview[lang]}</p>
          </div>
        </section>

        {/* Win conditions */}
        {guide.winConditions && (
          <section>
            <SectionTitle en="Win Conditions" th="เงื่อนไขการชนะ" lang={lang} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {guide.winConditions.map((wc, i) => (
                <div key={i} className="gothic-card rounded-2xl p-5" style={{ border: `1px solid ${wc.borderColor}` }}>
                  <div className="text-3xl mb-3">{wc.icon}</div>
                  <div className="text-lg font-bold mb-2" style={{ fontFamily: "var(--font-gothic)", color: wc.color }}>
                    {wc.title[lang]}
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "#7a6a5a" }}>{wc.body[lang]}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Game flow */}
        <section>
          <SectionTitle en="Game Flow" th="ลำดับเกม" lang={lang} />
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {guide.gameFlow.map((step, i, arr) => (
              <div key={i} className="flex items-center gap-2">
                <div className="text-center gothic-card rounded-xl px-4 py-3">
                  <div className="text-2xl mb-1">{step.icon}</div>
                  <div className="text-xs font-medium" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>{step.label[lang]}</div>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ color: "#5a4a3a" }}>→</div>
                )}
              </div>
            ))}
          </div>
          {guide.gameFlowNote && (
            <p className="text-center text-xs mt-3 italic" style={{ color: "#5a4a3a" }}>
              {guide.gameFlowNote[lang]}
            </p>
          )}
        </section>

        {/* Phases (day/night for SoT, cue/guess for H&C) */}
        {guide.phases?.map((phase) => (
          <section key={phase.titleKey}>
            <SectionTitle en={phase.title.en} th={phase.title.th} lang={lang} />
            <div className="gothic-card rounded-2xl p-6 space-y-3">
              {phase.steps[lang].map((step, i) => (
                <div key={i} className="flex gap-4">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
                    style={{ background: phase.accent, color: "#d4af37", fontFamily: "var(--font-gothic)" }}
                  >
                    {i + 1}
                  </div>
                  <p className="text-sm leading-relaxed pt-0.5" style={{ color: "#a08060" }}>{step}</p>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Scoring table (H&C specific) */}
        {guide.scoring && (
          <section>
            <SectionTitle en="Scoring" th="การคำนวณคะแนน" lang={lang} />
            <div className="gothic-card rounded-2xl overflow-hidden">
              <div className="grid grid-cols-4 px-4 py-2 text-xs tracking-widest uppercase" style={{ background: "rgba(45,27,78,0.6)", color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
                <span>{lang === "en" ? "Zone" : "โซน"}</span>
                <span className="text-center">{lang === "en" ? "Guesser" : "ผู้เดา"}</span>
                <span className="text-center">{lang === "en" ? "Cue Giver" : "Cue Giver"}</span>
                <span className="text-right">{lang === "en" ? "Dist." : "ระยะ"}</span>
              </div>
              {guide.scoring.rings.map((ring, i) => (
                <div key={i} className="grid grid-cols-4 px-4 py-3 items-center text-sm" style={{ borderTop: "1px solid rgba(212,175,55,0.08)", background: i % 2 === 0 ? "rgba(13,10,26,0.4)" : "transparent" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ring.color }} />
                    <span style={{ color: "#a08060" }}>{ring.label[lang]}</span>
                  </div>
                  <span className="text-center font-bold" style={{ color: ring.pts === "0" ? "#4a3a2a" : "#e8d5b0" }}>+{ring.pts}</span>
                  <span className="text-center font-bold" style={{ color: ring.cueGiver === "0" ? "#4a3a2a" : "#d4af37" }}>+{ring.cueGiver}</span>
                  <span className="text-right text-xs" style={{ color: "#5a4a3a" }}>
                    {i === 0 ? "0" : i === 1 ? "1–2" : i === 2 ? "3–4" : "5+"}
                  </span>
                </div>
              ))}
              <p className="px-4 py-3 text-xs italic" style={{ color: "#5a4a3a", borderTop: "1px solid rgba(212,175,55,0.08)" }}>
                {guide.scoring.note[lang]}
              </p>
            </div>
          </section>
        )}

        {/* Key rules */}
        <section>
          <SectionTitle en="Key Rules" th="กฎสำคัญ" lang={lang} />
          <div className="space-y-3">
            {guide.rules.items[lang].map((rule, i) => (
              <div key={i} className="gothic-card rounded-xl p-4 flex gap-4">
                <div className="text-2xl shrink-0">{rule.icon}</div>
                <div>
                  <div className="font-semibold mb-1" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>{rule.title}</div>
                  <p className="text-sm leading-relaxed" style={{ color: "#7a6a5a" }}>{rule.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Roles (SoT only) */}
        {rolesByType && (
          <section>
            <SectionTitle en="All Roles" th="บทบาททั้งหมด" lang={lang} />
            {(Object.entries(rolesByType) as [keyof typeof TYPE_META, Role[]][]).map(([type, roles]) => {
              const meta = TYPE_META[type];
              return (
                <div key={type} className="mb-10">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{meta.icon}</span>
                    <div>
                      <h3 className="text-lg font-bold" style={{ fontFamily: "var(--font-gothic)", color: meta.color }}>{meta.label[lang]}</h3>
                      <p className="text-xs" style={{ color: "#7a6a5a" }}>{meta.desc[lang]}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    {roles.map((role) => (
                      <RoleCard key={role.id} role={role} lang={lang} />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* Play CTA */}
        <div className="text-center pb-8">
          <Link
            href={fromSession ? `/session/${fromSession}` : `/session/create?game=${gameId}`}
            className="btn-gothic-primary px-8 py-4 rounded-xl font-bold text-lg no-underline inline-block"
            style={{ fontFamily: "var(--font-gothic)" }}
          >
            ⚔ {fromSession ? (lang === "en" ? "Back to Session" : "กลับสู่เกม") : (lang === "en" ? "Start Playing" : "เริ่มเล่น")}
          </Link>
        </div>

      </div>
    </div>
  );
}

function SectionTitle({ en, th, lang }: { en: string; th: string; lang: "en" | "th" }) {
  return (
    <div className="gothic-divider mb-6">
      <h2 className="text-xl font-bold tracking-widest uppercase text-center px-4" style={{ fontFamily: "var(--font-gothic)", color: "#d4af37" }}>
        {lang === "en" ? en : th}
      </h2>
    </div>
  );
}

export default function GuidePage() {
  return (
    <Suspense>
      <GuideContent />
    </Suspense>
  );
}
