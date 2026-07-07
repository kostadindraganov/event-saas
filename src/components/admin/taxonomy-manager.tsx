"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { AttributeDefinitionDTO, AttributeOptionSchema } from "@/data/catalog/attribute.dto";
import type { z } from "zod";
import type { CategoryRowDTO, RegionRowDTO, CityRowDTO } from "@/data/admin/admin.dto";

type AttrOption = z.infer<typeof AttributeOptionSchema>;
type Tab = "categories" | "attributes" | "locations";

// ---------- Категории ----------

function CategoryDialog({ category, trigger }: { category?: CategoryRowDTO; trigger: React.ReactNode }) {
  const t = useTranslations("Admin.categories");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nameBg: category?.nameBg ?? "", nameEn: category?.nameEn ?? "",
    slug: category?.slug ?? "", sortOrder: category?.sortOrder ?? 0,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.admin.taxonomy.category.list.queryKey() });
  const create = useMutation(trpc.admin.taxonomy.category.create.mutationOptions({
    onSuccess: () => { setOpen(false); invalidate(); toast.success(t("saved")); },
    onError: () => toast.error(t("errorGeneric")),
  }));
  const update = useMutation(trpc.admin.taxonomy.category.update.mutationOptions({
    onSuccess: () => { setOpen(false); invalidate(); toast.success(t("saved")); },
    onError: () => toast.error(t("errorGeneric")),
  }));
  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{category ? t("edit") : t("add")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t("nameBg")}</Label>
            <Input value={form.nameBg} onChange={(e) => setForm((f) => ({ ...f, nameBg: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t("nameEn")}</Label>
            <Input value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t("slug")}</Label>
            <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t("sortOrder")}</Label>
            <Input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} />
          </div>
        </div>
        <DialogFooter>
          <Button
            className="h-11"
            disabled={pending}
            onClick={() => category
              ? update.mutate({ id: category.id, ...form })
              : create.mutate(form)}
          >
            {pending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryManager() {
  const t = useTranslations("Admin.categories");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data } = useQuery(trpc.admin.taxonomy.category.list.queryOptions());
  const toggleActive = useMutation(trpc.admin.taxonomy.category.update.mutationOptions({
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: trpc.admin.taxonomy.category.list.queryKey() }); toast.success(t("saved")); },
    onError: () => toast.error(t("errorGeneric")),
  }));

  return (
    <div className="space-y-4">
      <CategoryDialog trigger={<Button className="h-11"><Plus /> {t("add")}</Button>} />
      {!data || data.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("nameBg")}</TableHead>
              <TableHead>{t("slug")}</TableHead>
              <TableHead>{t("sortOrder")}</TableHead>
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.nameBg}</TableCell>
                <TableCell>{c.slug}</TableCell>
                <TableCell>{c.sortOrder}</TableCell>
                <TableCell><Badge variant={c.isActive ? "default" : "outline"}>{c.isActive ? t("statusActive") : t("statusInactive")}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <CategoryDialog category={c} trigger={<Button variant="outline" size="icon-sm"><Pencil /></Button>} />
                    {c.isActive ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">{t("deactivate")}</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("deactivateConfirmTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>{t("deactivateConfirmBody")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => toggleActive.mutate({ id: c.id, isActive: false })}>
                              {t("deactivate")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => toggleActive.mutate({ id: c.id, isActive: true })}>
                        {t("activate")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ---------- Атрибути (CategoryAttributeEditor — обърнатата step-atributi.tsx логика) ----------

const ATTR_TYPES = ["single", "multi", "number", "boolean"] as const;

function AttributeDialog({
  categoryId, definition, trigger,
}: { categoryId: string; definition?: AttributeDefinitionDTO; trigger: React.ReactNode }) {
  const t = useTranslations("Admin.attributes");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(definition?.key ?? "");
  const [labelBg, setLabelBg] = useState(definition?.labelBg ?? "");
  const [labelEn, setLabelEn] = useState(definition?.labelEn ?? "");
  const [type, setType] = useState<AttributeDefinitionDTO["type"]>(definition?.type ?? "single");
  const [options, setOptions] = useState<AttrOption[]>(definition?.options ?? []);
  const [showAsFilter, setShowAsFilter] = useState(definition?.showAsFilter ?? false);
  const [showAsChip, setShowAsChip] = useState(definition?.showAsChip ?? false);
  const [sortOrder, setSortOrder] = useState(definition?.sortOrder ?? 0);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.admin.taxonomy.attribute.listByCategory.queryKey({ categoryId }) });
  const create = useMutation(trpc.admin.taxonomy.attribute.create.mutationOptions({
    onSuccess: () => { setOpen(false); invalidate(); toast.success(t("saved")); },
    onError: () => toast.error(t("errorGeneric")),
  }));
  const update = useMutation(trpc.admin.taxonomy.attribute.update.mutationOptions({
    onSuccess: () => { setOpen(false); invalidate(); toast.success(t("saved")); },
    onError: (err) => toast.error(err.data?.code === "CONFLICT" ? t("errorInUse") : t("errorGeneric")),
  }));
  const pending = create.isPending || update.isPending;
  const needsOptions = type === "single" || type === "multi";

  function submit() {
    const payload = {
      key, labelBg, labelEn, type,
      options: needsOptions ? options : null,
      showAsFilter, showAsChip, sortOrder,
    };
    if (definition) update.mutate({ id: definition.id, categoryId, ...payload });
    else create.mutate({ categoryId, ...payload });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{definition ? t("edit") : t("add")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2"><Label>{t("key")}</Label><Input value={key} onChange={(e) => setKey(e.target.value)} /></div>
          <div className="space-y-2"><Label>{t("labelBg")}</Label><Input value={labelBg} onChange={(e) => setLabelBg(e.target.value)} /></div>
          <div className="space-y-2"><Label>{t("labelEn")}</Label><Input value={labelEn} onChange={(e) => setLabelEn(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>{t("type")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as AttributeDefinitionDTO["type"])}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ATTR_TYPES.map((tp) => (
                  <SelectItem key={tp} value={tp}>{t(`type${tp[0]!.toUpperCase()}${tp.slice(1)}` as "typeSingle" | "typeMulti" | "typeNumber" | "typeBoolean")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsOptions && (
            <fieldset className="space-y-2 rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-medium">{t("options")}</legend>
              {options.map((o, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input className="max-w-32" placeholder={t("optionValue")} value={o.value}
                    onChange={(e) => setOptions((arr) => arr.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                  <Input className="max-w-36" placeholder={t("optionLabelBg")} value={o.labelBg}
                    onChange={(e) => setOptions((arr) => arr.map((x, j) => j === i ? { ...x, labelBg: e.target.value } : x))} />
                  <Input className="max-w-36" placeholder={t("optionLabelEn")} value={o.labelEn}
                    onChange={(e) => setOptions((arr) => arr.map((x, j) => j === i ? { ...x, labelEn: e.target.value } : x))} />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOptions((arr) => arr.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setOptions((arr) => [...arr, { value: "", labelBg: "", labelEn: "" }])}>
                <Plus /> {t("addOption")}
              </Button>
            </fieldset>
          )}
          <div className="flex items-center gap-3">
            <Switch checked={showAsFilter} onCheckedChange={setShowAsFilter} />
            <Label>{t("showAsFilter")}</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={showAsChip} onCheckedChange={setShowAsChip} />
            <Label>{t("showAsChip")}</Label>
          </div>
          <div className="space-y-2"><Label>{t("sortOrder")}</Label><Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} /></div>
        </div>
        <DialogFooter>
          <Button className="h-11" disabled={pending} onClick={submit}>{pending ? t("saving") : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttributeManager() {
  const t = useTranslations("Admin.attributes");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: categories } = useQuery(trpc.admin.taxonomy.category.list.queryOptions());
  const [categoryId, setCategoryId] = useState<string>("");
  const activeCategoryId = categoryId || categories?.[0]?.id || "";
  const { data: defs } = useQuery({
    ...trpc.admin.taxonomy.attribute.listByCategory.queryOptions({ categoryId: activeCategoryId }),
    enabled: !!activeCategoryId,
  });
  const remove = useMutation(trpc.admin.taxonomy.attribute.remove.mutationOptions({
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: trpc.admin.taxonomy.attribute.listByCategory.queryKey({ categoryId: activeCategoryId }) }); toast.success(t("saved")); },
    onError: (err) => toast.error(err.data?.code === "CONFLICT" ? t("errorInUse") : t("errorGeneric")),
  }));

  return (
    <div className="space-y-4">
      <div className="max-w-72 space-y-2">
        <Label>{t("categoryLabel")}</Label>
        <Select value={activeCategoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nameBg}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {activeCategoryId && <AttributeDialog categoryId={activeCategoryId} trigger={<Button className="h-11"><Plus /> {t("add")}</Button>} />}
      {!defs || defs.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("key")}</TableHead>
              <TableHead>{t("labelBg")}</TableHead>
              <TableHead>{t("type")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {defs.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.key}</TableCell>
                <TableCell>{d.labelBg}</TableCell>
                <TableCell>{t(`type${d.type[0]!.toUpperCase()}${d.type.slice(1)}` as "typeSingle" | "typeMulti" | "typeNumber" | "typeBoolean")}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <AttributeDialog categoryId={activeCategoryId} definition={d} trigger={<Button variant="outline" size="icon-sm"><Pencil /></Button>} />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon-sm"><Trash2 /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>{t("deleteConfirmBody")}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => remove.mutate({ id: d.id })}>{t("delete")}</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ---------- Локации ----------

function RegionDialog({ region, trigger }: { region?: RegionRowDTO; trigger: React.ReactNode }) {
  const t = useTranslations("Admin.locations");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(region?.name ?? "");
  const [slug, setSlug] = useState(region?.slug ?? "");
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.admin.taxonomy.region.list.queryKey() });
  const create = useMutation(trpc.admin.taxonomy.region.create.mutationOptions({
    onSuccess: () => { setOpen(false); invalidate(); toast.success(t("saved")); },
    onError: () => toast.error(t("errorGeneric")),
  }));
  const update = useMutation(trpc.admin.taxonomy.region.update.mutationOptions({
    onSuccess: () => { setOpen(false); invalidate(); toast.success(t("saved")); },
    onError: () => toast.error(t("errorGeneric")),
  }));
  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{region ? t("addRegion") : t("addRegion")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2"><Label>{t("name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-2"><Label>{t("slug")}</Label><Input value={slug} onChange={(e) => setSlug(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button className="h-11" disabled={pending}
            onClick={() => region ? update.mutate({ id: region.id, name, slug }) : create.mutate({ name, slug })}>
            {pending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CityDialog({ regionId, city, trigger }: { regionId: string; city?: CityRowDTO; trigger: React.ReactNode }) {
  const t = useTranslations("Admin.locations");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(city?.name ?? "");
  const [slug, setSlug] = useState(city?.slug ?? "");
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.admin.taxonomy.city.listByRegion.queryKey({ regionId }) });
  const create = useMutation(trpc.admin.taxonomy.city.create.mutationOptions({
    onSuccess: () => { setOpen(false); invalidate(); toast.success(t("saved")); },
    onError: () => toast.error(t("errorGeneric")),
  }));
  const update = useMutation(trpc.admin.taxonomy.city.update.mutationOptions({
    onSuccess: () => { setOpen(false); invalidate(); toast.success(t("saved")); },
    onError: () => toast.error(t("errorGeneric")),
  }));
  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("addCity")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2"><Label>{t("name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-2"><Label>{t("slug")}</Label><Input value={slug} onChange={(e) => setSlug(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button className="h-11" disabled={pending}
            onClick={() => city ? update.mutate({ id: city.id, regionId, name, slug }) : create.mutate({ regionId, name, slug })}>
            {pending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocationManager() {
  const t = useTranslations("Admin.locations");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: regions } = useQuery(trpc.admin.taxonomy.region.list.queryOptions());
  const [regionId, setRegionId] = useState("");
  const { data: cities } = useQuery({
    ...trpc.admin.taxonomy.city.listByRegion.queryOptions({ regionId }),
    enabled: !!regionId,
  });
  const removeRegion = useMutation(trpc.admin.taxonomy.region.remove.mutationOptions({
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: trpc.admin.taxonomy.region.list.queryKey() }); toast.success(t("saved")); },
    onError: (err) => toast.error(err.data?.code === "CONFLICT" ? t("errorInUse") : t("errorGeneric")),
  }));
  const removeCity = useMutation(trpc.admin.taxonomy.city.remove.mutationOptions({
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: trpc.admin.taxonomy.city.listByRegion.queryKey({ regionId }) }); toast.success(t("saved")); },
    onError: (err) => toast.error(err.data?.code === "CONFLICT" ? t("errorInUse") : t("errorGeneric")),
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t("regionsTab")}</h2>
          <RegionDialog trigger={<Button size="sm"><Plus /> {t("addRegion")}</Button>} />
        </div>
        {!regions || regions.length === 0 ? <p className="text-muted-foreground">{t("emptyRegions")}</p> : (
          <Table>
            <TableBody>
              {regions.map((r) => (
                <TableRow key={r.id} data-state={r.id === regionId ? "selected" : undefined} className="cursor-pointer" onClick={() => setRegionId(r.id)}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <RegionDialog region={r} trigger={<Button variant="outline" size="icon-sm" onClick={(e) => e.stopPropagation()}><Pencil /></Button>} />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="icon-sm" onClick={(e) => e.stopPropagation()}><Trash2 /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>{t("deleteConfirmBody")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => removeRegion.mutate({ id: r.id })}>{t("delete")}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t("citiesTab")}</h2>
          {regionId && <CityDialog regionId={regionId} trigger={<Button size="sm"><Plus /> {t("addCity")}</Button>} />}
        </div>
        {!regionId ? <p className="text-muted-foreground">{t("emptyCities")}</p> : !cities || cities.length === 0 ? (
          <p className="text-muted-foreground">{t("emptyCities")}</p>
        ) : (
          <Table>
            <TableBody>
              {cities.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <CityDialog regionId={regionId} city={c} trigger={<Button variant="outline" size="icon-sm"><Pencil /></Button>} />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="icon-sm"><Trash2 /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>{t("deleteConfirmBody")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => removeCity.mutate({ id: c.id })}>{t("delete")}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ---------- Shell ----------

export function TaxonomyManager() {
  const t = useTranslations("Admin.categories");
  const tAttr = useTranslations("Admin.attributes");
  const tLoc = useTranslations("Admin.locations");
  const [tab, setTab] = useState<Tab>("categories");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant={tab === "categories" ? "default" : "outline"} className="h-11" onClick={() => setTab("categories")}>{t("title")}</Button>
        <Button variant={tab === "attributes" ? "default" : "outline"} className="h-11" onClick={() => setTab("attributes")}>{tAttr("title")}</Button>
        <Button variant={tab === "locations" ? "default" : "outline"} className="h-11" onClick={() => setTab("locations")}>{tLoc("title")}</Button>
      </div>
      {tab === "categories" && <CategoryManager />}
      {tab === "attributes" && <AttributeManager />}
      {tab === "locations" && <LocationManager />}
    </div>
  );
}
