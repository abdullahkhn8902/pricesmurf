"use client"; // Must be at the very top
import { HeroHighlight, Highlight } from "@/component-landing/ui/hero-highlight";
import React from "react";
import { motion } from "framer-motion";
import { AuroraBackground } from "@/component-landing/ui/aurora-background";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function BackgroundLinesDemo() {
    const { isSignedIn } = useUser();
    const router = useRouter();

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();

        if (isSignedIn) {
            router.push("/app-pages/upload");
        } else {
            alert("Please login first to continue.");
        }
    };

    return (
        <>
            <AuroraBackground>
                <HeroHighlight>
                    <motion.h1
                        initial={{
                            opacity: 0,
                            y: 20,
                        }}
                        animate={{
                            opacity: 1,
                            y: [20, -5, 0],
                        }}
                        transition={{
                            duration: 0.5,
                            ease: [0.4, 0.0, 0.2, 1],
                        }}
                        className="text-2xl px-4 md:text-4xl lg:text-5xl font-bold text-neutral-700 max-w-4xl leading-relaxed lg:leading-snug text-center mx-auto mt-[10rem]"
                    >
                        Stop Wrestling with your data
                        <br />{" "}
                        <Highlight className="text-white">
                            Start Winning with PriceSmurf
                        </Highlight>
                        <p className="max-w-xl mx-auto text-sm md:text-lg text-neutral-700 text-center font-light m-5">
                            Merge, edit, delete and analyze every bit of your company data—no more manual clean-ups. Instant AI analysis, fully customizable.
                        </p>
                        <div className="flex flex-col items-center mt-10">
                            <div className="flex flex-row items-center justify-center space-x-4">
                                <div className="hidden md:flex -space-x-4 rtl:space-x-reverse">
                                    <img
                                        className="w-10 h-10 border-2 border-white rounded-full"
                                        src="https://randomuser.me/api/portraits/men/32.jpg"
                                        alt="User 1"
                                    />
                                    <img
                                        className="w-10 h-10 border-2 border-white rounded-full"
                                        src="https://randomuser.me/api/portraits/women/44.jpg"
                                        alt="User 2"
                                    />
                                    <img
                                        className="w-10 h-10 border-2 border-white rounded-full"
                                        src="https://randomuser.me/api/portraits/men/65.jpg"
                                        alt="User 3"
                                    />
                                    <img
                                        className="w-10 h-10 border-2 border-white rounded-full"
                                        src="https://randomuser.me/api/portraits/men/32.jpg"
                                        alt="User 4"
                                    />
                                    <img
                                        className="w-10 h-10 border-2 border-white rounded-full"
                                        src="https://randomuser.me/api/portraits/women/44.jpg"
                                        alt="User 5"
                                    />
                                    <img
                                        className="w-10 h-10 border-2 border-white rounded-full"
                                        src="https://randomuser.me/api/portraits/men/65.jpg"
                                        alt="User 6"
                                    />
                                    <a
                                        className="flex items-center justify-center w-10 h-10 text-xs font-medium text-white bg-gray-700 border-2 border-white rounded-full hover:bg-gray-600"
                                        href="#"
                                    >
                                        +99
                                    </a>
                                </div>

                                <p className="font-extralight text-lg whitespace-nowrap">
                                    Trusted by fast-growing teams.
                                </p>
                            </div>

                            <div className="flex justify-center space-x-4 mt-10">
                                <button
                                    onClick={handleClick}
                                    className="inline-block rounded-sm border border-indigo-900 bg-indigo-900 px-12 py-3 text-sm font-medium text-white hover:bg-transparent hover:text-indigo-900 focus:ring-3 focus:outline-hidden"
                                >
                                    Get Started for Free
                                </button>

                            </div>
                        </div>
                    </motion.h1>
                </HeroHighlight>
            </AuroraBackground>
        </>
    );
}
