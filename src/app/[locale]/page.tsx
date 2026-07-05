import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("Home");
  return (
    <>
      <h1 className="font-serif text-4xl">{t("title")}</h1>
    </>
  );
}
