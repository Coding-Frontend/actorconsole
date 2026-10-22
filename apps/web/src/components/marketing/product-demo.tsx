"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Play } from "lucide-react";
import { HomeGridCell, HomeGridRow, HomeGridSection } from "@/components/marketing/home-grid";

const videoUrl = "https://www.youtube.com/watch?v=nA-7Aq_knPw";

export function ProductDemo() {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <HomeGridSection
      id="product-demo"
      className="scroll-mt-20"
      aria-labelledby="product-demo-title"
    >
      <HomeGridRow>
        <HomeGridCell className="col-span-4 flex flex-col justify-center px-6 py-10 sm:px-8 lg:p-10">
          <p className="home-grid-kicker">70 seconds / product tour</p>
          <h2
            id="product-demo-title"
            className="font-display-tight text-foreground mt-5 text-[36px] sm:text-[44px]"
          >
            See ActorConsole in action.
          </h2>
          <p className="text-muted-foreground mt-5 max-w-sm text-base leading-7">
            Research Actors, connect your Apify account, improve listings, schedule publishing, and
            understand usage costs, revenue, and profit.
          </p>
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:text-signal-orange focus-visible:ring-ring mt-7 inline-flex w-fit items-center gap-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-4"
          >
            Watch on YouTube
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </HomeGridCell>
        <HomeGridCell className="bg-fog/35 col-span-8 flex items-center px-6 py-10 sm:px-8 lg:p-10">
          <div className="border-border relative aspect-video w-full overflow-hidden border bg-black">
            {isPlaying ? (
              <iframe
                src="https://www.youtube-nocookie.com/embed/nA-7Aq_knPw?autoplay=1&rel=0"
                title="ActorConsole — From Actor Research to Revenue & Profit"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsPlaying(true)}
                aria-label="Play the 70-second ActorConsole product demo"
                className="focus-visible:ring-signal-orange group absolute inset-0 h-full w-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset"
              >
                <Image
                  src="/images/actorconsole-demo.jpg"
                  alt=""
                  fill
                  sizes="(max-width: 1023px) 100vw, 65vw"
                  className="object-contain"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/20">
                  <span className="bg-signal-orange flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition-transform group-hover:scale-105 motion-reduce:transition-none">
                    <Play className="ml-1 h-7 w-7 fill-current" aria-hidden="true" />
                  </span>
                </span>
                <span className="absolute bottom-3 right-3 bg-black/75 px-2 py-1 text-xs font-medium text-white">
                  1:11
                </span>
              </button>
            )}
          </div>
        </HomeGridCell>
      </HomeGridRow>
    </HomeGridSection>
  );
}
