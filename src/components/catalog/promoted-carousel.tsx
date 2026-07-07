"use client";

import type { ReactNode } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

export function PromotedCarousel({
  children,
  prevLabel,
  nextLabel,
}: {
  children: ReactNode;
  prevLabel: string;
  nextLabel: string;
}) {
  return (
    <Carousel opts={{ align: "start" }} className="px-2 sm:px-10">
      <CarouselContent>{children}</CarouselContent>
      <CarouselPrevious aria-label={prevLabel} className="hidden sm:flex" />
      <CarouselNext aria-label={nextLabel} className="hidden sm:flex" />
    </Carousel>
  );
}
