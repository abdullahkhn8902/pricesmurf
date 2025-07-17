import React from "react";
import { NavbarDemo } from "@/component-app/Navbar";
import { Footer } from "@/component-landing/Footer";


export default function AboutUs() {
    return (
        <>
            <section>
                <NavbarDemo />
                {/* Container */}
                <div className="mx-auto w-full max-w-7xl px-5 py-20 md:px-6 md:py-30">
                    {/* Component */}
                    <div className="grid gap-12 sm:gap-12 md:grid-cols-2">
                        {/* Content */}
                        <div className="flex flex-col items-start gap-2">
                            <div className="flex items-center rounded-md bg-gray-300 px-3 py-1">
                                <div className="mr-1 h-2 w-2 rounded-full bg-black"></div>
                                <p className="text-sm">Available for support</p>
                            </div>
                            <p className="text-sm text-gray-500 sm:text-xl">
                                Founder & CEO
                            </p>
                            {/* Title */}
                            <h1 className="mb-6 text-4xl font-bold md:text-6xl md:mb-8">
                                Valentin Kovacic                      </h1>
                            <p className="text-sm text-gray-500 sm:text-xl">
                                Leading Pricesmurf to revolutionize data management with AI, providing tools to manage, analyze, and optimize company data.
                            </p>
                            {/* Divider */}
                            <div className="mb-8 mt-8 h-px w-full bg-black"></div>
                            <div className="mb-6 flex flex-col gap-2 text-sm text-gray-500 sm:text-base md:mb-8">
                                <p>
                                    <strong>2023: </strong>Launched Pricesmurf, transforming data handling for businesses
                                </p>
                                <p>
                                    <strong>2025: </strong>Recognized for innovative AI data solutions
                                </p>
                            </div>
                            {/* Link */}

                        </div>
                        {/* Image */}
                        <div className="min-h-[530px] overflow-hidden rounded-md bg-gray-100"></div>
                    </div>
                </div>
            </section>
            <Footer />
        </>
    );
}
