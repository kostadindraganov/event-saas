import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const t = useTranslations("Home");
  return (
    <>
      <h1 className="font-serif text-4xl">{t("title")}</h1>
      <Button>Резервирай</Button>
    </>
  );
}
