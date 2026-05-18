const KEY = "bgv_lang";

export const getLang = (): "en" | "th" => {
  if (typeof window === "undefined") return "en";
  return (localStorage.getItem(KEY) as "en" | "th") ?? "en";
};

export const saveLang = (lang: "en" | "th") => {
  localStorage.setItem(KEY, lang);
};
