"use client";

import React from "react";
import { WobbleCard } from "./ui/wobble-card";

export function WobbleCardDemo() {
    return (
        <section className="bg-white">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-7xl mx-auto w-full bg-white">
                <WobbleCard
                    containerClassName="col-span-1 lg:col-span-2 h-full bg-pink-800 min-h-[400px] lg:min-h-[300px]"
                    className=""
                >
                    <div className="max-w-xs">
                        <h2 className="text-left text-balance text-base md:text-xl lg:text-3xl font-semibold tracking-[-0.015em] text-white">
                            Transform Your Business with AI                    </h2>
                        <p className="mt-4 text-left  text-base/6 text-neutral-200">
                            Unlock data potential with Pricesmurf's AI, managing and optimizing for 100,000+ users.                         </p>
                    </div>
                    <img
                        src="/Dashboard.png"
                        width={500}
                        height={500}
                        alt="linear demo image"
                        className="absolute -right-4 lg:-right-[30%]  grayscale filter -bottom-10 object-contain rounded-2xl lg:top-[25%] top-[50%] xl:-right-[10%]"
                    />
                </WobbleCard>
                <WobbleCard containerClassName="col-span-1 min-h-[300px]">
                    <h2 className="max-w-80  text-left text-balance text-base md:text-xl lg:text-3xl font-semibold tracking-[-0.015em] text-white">
                        Secure Data Handling                </h2>
                    <p className="mt-4 max-w-[26rem] text-left  text-base/6 text-neutral-200">
                        Enjoy a secure, user-friendly Pricesmurf environment for safe data edits and uploads.                                         </p>
                </WobbleCard>
                <WobbleCard containerClassName="col-span-1 lg:col-span-3 bg-blue-900 min-h-[400px] lg:min-h-[300px] xl:min-h-[300px]">
                    <div className="max-w-sm">
                        <h2 className="max-w-sm md:max-w-lg  text-left text-balance text-base md:text-xl lg:text-3xl font-semibold tracking-[-0.015em] text-white">
                            Join for Instant AI Solutions
                        </h2>
                        <p className="mt-4 max-w-[26rem] text-left  text-base/6 text-neutral-200">
                            Start with Pricesmurf for instant AI analysis and custom file prompts.                                     </p>
                    </div>
                    <img
                        src="/aianalyse.png"
                        width={500}
                        height={500}
                        alt="linear demo image"
                        className="absolute -right-10 md:-right-[0%] lg:-right-[0%] -bottom-10 object-contain rounded-2xl top-[50%]"
                    />
                </WobbleCard>
            </div>
        </section>
    );
}
