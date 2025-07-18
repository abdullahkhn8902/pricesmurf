import React from "react";
import { NavbarDemo } from "@/component-app/Navbar";
import { Footer } from "@/component-landing/Footer";

export default function Features() {
    return (
        <>
            <NavbarDemo />
            <section className="bg-white">
                {/* Container */}
                <div className="mx-auto w-full max-w-7xl px-5 py-24 md:px-10 md:py-33 h-full">
                    {/* Component */}
                    <div className="mx-auto mb-8 flex max-w-3xl flex-col items-center text-center md:mb-12">
                        <h2 className="text-3xl font-bold md:text-5xl">
                            Enhance Your Data Management with Pricesmurf
                        </h2>
                        <p className="mx-auto mb-8 mt-4 max-w-lg text-base text-gray-500 md:mb-12 md:text-lg">
                            Leverage AI to manage, analyze, and optimize your company data efficiently.
                        </p>
                        <div className="flex justify-center">
                            <div className="mr-6 md:mr-10">
                                <h3 className="text-2xl font-bold md:text-3xl">1,500+</h3>
                                <p className="text-sm text-gray-500">Active Users</p>
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold md:text-3xl">10,000+</h3>
                                <p className="text-sm text-gray-500">Files Processed</p>
                            </div>
                        </div>
                    </div>
                    {/* Image */}
                    <img src="/upload.png" alt="Data Management Overview" className="inline-block h-[500px] w-full object-cover" />
                </div>
                <div className="pt-48">
                    <div className="relative py-16 md:py-24 lg:py-32">
                        <div className="sticky top-0 -mt-48 mb-48 rounded-t-[46px] border-t border-black bg-white px-5 py-10 sm:px-20">
                            <div className="mb-14 flex gap-8 text-2xl font-bold">
                                <p>01</p>
                                <p>Data Management</p>
                            </div>
                            <div className="flex flex-col-reverse gap-8 sm:gap-20 lg:flex-row lg:items-center">
                                <div className="max-w-2xl">
                                    <img src="/Dashboard.png" alt="File Integration Dashboard" />
                                </div>
                                <div className="max-w-2xl">
                                    <h2 className="mb-4 text-3xl font-bold md:text-5xl">Seamless Data Management</h2>
                                    <p className="text-sm text-[#636262] sm:text-base">Combine multiple files into a unified analysis with Pricesmurf's advanced integration tools</p>
                                </div>
                            </div>
                        </div>
                        <div className="sticky top-24 -mt-24 mb-24 rounded-t-[46px] border-t border-black bg-white px-5 py-10 sm:px-20">
                            <div className="mb-14 flex gap-8 text-2xl font-bold">
                                <p>02</p>
                                <p>Data Optimization</p>
                            </div>
                            <div className="flex flex-col-reverse gap-8 sm:gap-20 lg:flex-row lg:items-center">
                                <div className="max-w-2xl">
                                    <img src="/editing.png" alt="AI Analysis Interface" />
                                </div>
                                <div className="max-w-2xl">
                                    <h2 className="mb-4 text-3xl font-bold md:text-5xl">Optimized Data Performance</h2>
                                    <p className="text-sm text-[#636262] sm:text-base">Boost performance with optimization features rolled out.</p>
                                </div>
                            </div>
                        </div>
                        <div className="sticky top-48 rounded-t-[46px] border-t border-black bg-white px-5 py-10 sm:px-20">
                            <div className="mb-14 flex gap-8 text-2xl font-bold">
                                <p>03</p>
                                <p>Custom Prompts</p>
                            </div>
                            <div className="flex flex-col-reverse gap-8 sm:gap-20 lg:flex-row lg:items-center">
                                <div className="max-w-2xl">
                                    <img src="/customprompt.png" alt="Custom Prompts Setup" />
                                </div>
                                <div className="max-w-2xl">
                                    <h2 className="mb-4 text-3xl font-bold md:text-5xl">Tailored Custom Prompts</h2>
                                    <p className="text-sm text-[#636262] sm:text-base">Create personalized AI prompts for specific analysis needs.</p>
                                </div>
                            </div>
                        </div>
                        <div className="sticky top-48 rounded-t-[46px] border-t border-black bg-white px-5 py-10 sm:px-20">
                            <div className="mb-14 flex gap-8 text-2xl font-bold">
                                <p>04</p>
                                <p>AI Data Analysis</p>
                            </div>
                            <div className="flex flex-col-reverse gap-8 sm:gap-20 lg:flex-row lg:items-center">
                                <div className="max-w-2xl">
                                    <img src="/aianalyse.png" alt="Data Optimization Tools" />
                                </div>

                                <div className="max-w-2xl">
                                    <h2 className="mb-4 text-3xl font-bold md:text-5xl">Powerful AI Analysis</h2>
                                    <p className="text-sm text-[#636262] sm:text-base">Gain instant insights with AI tools updated for enhanced data interpretation.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <Footer />
        </>
    );
}