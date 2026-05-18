"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FIRST_SHADOWS_ROLES } from "@/lib/games/shadows-over-thornwick/roles";
import type { Role } from "@/types/game";
import { Suspense } from "react";

// RoleCard has no local state — useState is used by GuideContent for lang toggle

// ---------- Content per game ----------
const GUIDES = {
  "shadows-over-thornwick": {
    name: { en: "Shadows Over Thornwick", th: "เงามืดเหนือธอร์นวิค" },
    cover: "/images/games/shadows-over-thornwick/cover.png",
    players: "5–15",
    tagline: {
      en: "A social deduction game of murder and mystery in the cursed village of Thornwick.",
      th: "เกมสืบสวนสังคมแห่งการฆาตกรรมและความลึกลับในหมู่บ้านต้องสาป ธอร์นวิค",
    },
    overview: {
      en: "One player is the Storyteller — neutral, all-knowing, and in control of the game. The rest are secret villagers of Thornwick, divided between Good and Evil. No one knows who is who. Through discussion, deduction, and deception, the village must find and execute the Demon before it kills everyone.",
      th: "ผู้เล่นหนึ่งคนเป็น Storyteller ที่เป็นกลาง รู้ทุกอย่าง และควบคุมเกม ส่วนที่เหลือเป็นชาวหมู่บ้านธอร์นวิคที่แบ่งเป็นฝ่ายดีและฝ่ายชั่วอย่างลับๆ ไม่มีใครรู้ว่าใครเป็นใคร ผ่านการถกเถียง อนุมาน และการหลอกลวง หมู่บ้านต้องหาและประหารปีศาจก่อนที่มันจะฆ่าทุกคน",
    },
    winGood: {
      en: "Execute the Demon. When the Demon is voted out and executed during the day, the village wins immediately.",
      th: "ประหาร Demon เมื่อ Demon ถูกโหวตและประหารในตอนกลางวัน หมู่บ้านชนะทันที",
    },
    winEvil: {
      en: "Only 2 players remain alive (including the Demon). When the village shrinks to 2 survivors, the Demon's grip is unbreakable.",
      th: "เหลือผู้เล่นมีชีวิตเพียง 2 คน (รวม Demon) เมื่อหมู่บ้านเหลือผู้รอดชีวิต 2 คน Demon ชนะ",
    },
    dayPhase: {
      title: { en: "Day Phase ☀️", th: "ช่วงกลางวัน ☀️" },
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
    nightPhase: {
      title: { en: "Night Phase 🌙", th: "ช่วงกลางคืน 🌙" },
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
      <div className="px-4 pt-3 pb-1">
        <p className="text-sm leading-relaxed font-medium" style={{ color: "#c0a878" }}>
          {role.ability[lang]}
        </p>
      </div>

      {/* Description */}
      <div className="px-4 pb-4 pt-1">
        <div className="h-px mb-2" style={{ background: meta.border }} />
        <p className="text-sm leading-relaxed" style={{ color: "#9a8a6a" }}>
          {role.description[lang]}
        </p>
      </div>
    </div>
  );
}

function GuideContent() {
  const params = useParams();
  const gameId = params.gameId as string;
  const guide = GUIDES[gameId as keyof typeof GUIDES];
  const [lang, setLang] = useState<"en" | "th">("en");

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

  const rolesByType = {
    townsfolk: guide.roles.filter((r) => r.type === "townsfolk"),
    outsider: guide.roles.filter((r) => r.type === "outsider"),
    minion: guide.roles.filter((r) => r.type === "minion"),
    demon: guide.roles.filter((r) => r.type === "demon"),
  };

  return (
    <div className="min-h-screen" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 60%)" }}>

      {/* Hero */}
      <div className="relative h-64 md:h-80 w-full overflow-hidden">
        <Image src={guide.cover} alt={guide.name[lang]} fill className="object-cover opacity-50" />
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
        <Link href="/" className="btn-gothic-secondary px-4 py-2 rounded-lg text-sm no-underline">← {lang === "en" ? "Home" : "หน้าแรก"}</Link>
        <span className="text-xs tracking-widest uppercase" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
          {lang === "en" ? "How to Play" : "วิธีเล่น"}
        </span>
        <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-4 py-2 rounded-lg text-sm">
          {lang === "en" ? "🇹🇭 TH" : "🇬🇧 EN"}
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-12">

        {/* Overview */}
        <section>
          <SectionTitle en="Overview" th="ภาพรวม" lang={lang} />
          <div className="gothic-card rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">🏰</span>
              <div>
                <div className="text-xs tracking-widest uppercase" style={{ color: "#d4af37" }}>{lang === "en" ? "Players" : "ผู้เล่น"}</div>
                <div className="font-bold" style={{ color: "#e8d5b0" }}>{guide.players} {lang === "en" ? "players" : "คน"} + 1 Storyteller</div>
              </div>
            </div>
            <p className="leading-relaxed" style={{ color: "#a08060" }}>{guide.overview[lang]}</p>
          </div>
        </section>

        {/* Win conditions */}
        <section>
          <SectionTitle en="Win Conditions" th="เงื่อนไขการชนะ" lang={lang} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="gothic-card rounded-2xl p-5" style={{ border: "1px solid rgba(74,111,165,0.3)" }}>
              <div className="text-3xl mb-3">☀️</div>
              <div className="text-lg font-bold mb-2" style={{ fontFamily: "var(--font-gothic)", color: "#80b0ff" }}>
                {lang === "en" ? "Good Wins" : "ฝ่ายดีชนะ"}
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "#7a6a8a" }}>{guide.winGood[lang]}</p>
            </div>
            <div className="gothic-card rounded-2xl p-5" style={{ border: "1px solid rgba(139,26,26,0.3)" }}>
              <div className="text-3xl mb-3">😈</div>
              <div className="text-lg font-bold mb-2" style={{ fontFamily: "var(--font-gothic)", color: "#ff8080" }}>
                {lang === "en" ? "Evil Wins" : "ฝ่ายชั่วชนะ"}
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "#8a6a6a" }}>{guide.winEvil[lang]}</p>
            </div>
          </div>
        </section>

        {/* Game flow */}
        <section>
          <SectionTitle en="Game Flow" th="ลำดับเกม" lang={lang} />
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {[
              { icon: "🏰", label: { en: "Lobby", th: "ห้องรอ" } },
              { icon: "🎴", label: { en: "Role Reveal", th: "เปิดบทบาท" } },
              { icon: "☀️", label: { en: "Day", th: "กลางวัน" } },
              { icon: "🌙", label: { en: "Night", th: "กลางคืน" } },
              { icon: "🏆", label: { en: "Victory", th: "ชนะ" } },
            ].map((step, i, arr) => (
              <div key={i} className="flex items-center gap-2">
                <div className="text-center gothic-card rounded-xl px-4 py-3">
                  <div className="text-2xl mb-1">{step.icon}</div>
                  <div className="text-xs font-medium" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>{step.label[lang]}</div>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ color: "#5a4a3a" }}>
                    {i === 2 ? "⟷" : "→"}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-xs mt-3 italic" style={{ color: "#5a4a3a" }}>
            {lang === "en" ? "Day and Night repeat until Good or Evil wins" : "กลางวันและกลางคืนวนซ้ำจนกว่าฝ่ายใดฝ่ายหนึ่งจะชนะ"}
          </p>
        </section>

        {/* Day phase */}
        <section>
          <SectionTitle en="Day Phase ☀️" th="ช่วงกลางวัน ☀️" lang={lang} />
          <div className="gothic-card rounded-2xl p-6 space-y-3">
            {guide.dayPhase.steps[lang].map((step, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5" style={{ background: "rgba(212,175,55,0.15)", color: "#d4af37", fontFamily: "var(--font-gothic)" }}>{i + 1}</div>
                <p className="text-sm leading-relaxed pt-0.5" style={{ color: "#a08060" }}>{step}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Night phase */}
        <section>
          <SectionTitle en="Night Phase 🌙" th="ช่วงกลางคืน 🌙" lang={lang} />
          <div className="gothic-card rounded-2xl p-6 space-y-3">
            {guide.nightPhase.steps[lang].map((step, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5" style={{ background: "rgba(45,27,78,0.4)", color: "#c0a0ff", fontFamily: "var(--font-gothic)" }}>{i + 1}</div>
                <p className="text-sm leading-relaxed pt-0.5" style={{ color: "#a08060" }}>{step}</p>
              </div>
            ))}
          </div>
        </section>

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

        {/* Roles */}
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

        {/* Play CTA */}
        <div className="text-center pb-8">
          <Link href="/session/create?game=shadows-over-thornwick" className="btn-gothic-primary px-8 py-4 rounded-xl font-bold text-lg no-underline inline-block" style={{ fontFamily: "var(--font-gothic)" }}>
            ⚔ {lang === "en" ? "Start Playing" : "เริ่มเล่น"}
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
