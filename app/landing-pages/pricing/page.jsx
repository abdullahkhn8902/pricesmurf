import React from "react";
import { NavbarDemo } from "@/component-app/Navbar";
import { Footer } from "@/component-landing/Footer";

export default function Pricing() {
    return (
        <>
            <NavbarDemo />

            <section className="bg-white">
                {/* Container */}
                <div className="mx-auto max-w-7xl px-5 py-30 md:px-10 md:py-40">
                    {/* Heading Container */}
                    <div className="mx-auto mb-8 max-w-3xl text-center md:mb-12 lg:mb-16">
                        {/* Heading */}
                        <h2 className="text-3xl font-bold md:text-5xl text-indigo-900">
                            Simple & Affordable Pricing for Pricesmurf
                        </h2>
                        {/* Subheading */}
                        <p className="mt-4 text-sm text-indigo-900 sm:text-base">
                            Flexible plans with a 30-day money-back guarantee
                        </p>
                    </div>

                    {/* Price Container */}
                    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
                        {/* Price - Basic */}
                        <div className="mx-auto flex w-full max-w-md flex-col items-start rounded-md border border-gray-300 p-8 text-indigo-900">
                            <div className="mb-4 rounded-md bg-black px-4 py-1.5">
                                <p className="text-sm font-bold text-white sm:text-sm">BASIC</p>
                            </div>
                            <p className="mb-6 text-base font-light text-gray-500 md:mb-10 lg:mb-12">
                                Ideal for small businesses starting with data management.
                            </p>
                            <h2 className="mb-5 text-3xl font-bold md:text-5xl lg:mb-8">
                                $99<span className="text-sm font-light sm:text-sm">/year</span>
                            </h2>
                            <a href="#" className="mb-5 w-full rounded-md bg-black px-6 py-3 text-center font-semibold text-white lg:mb-8">
                                Get Started
                            </a>
                            <div className="mt-2 flex items-center">
                                <img src="https://assets.website-files.com/6458c625291a94a195e6cf3a/6458c625291a94a84be6cf60_check-mark.svg" alt="" className="mr-2 inline-block w-4" />
                                <p className="text-base">Basic Data Upload</p>
                            </div>
                            <div className="mt-2 flex items-center">
                                <img src="https://assets.website-files.com/6458c625291a94a195e6cf3a/6458c625291a94a84be6cf60_check-mark.svg" alt="" className="mr-2 inline-block w-4" />
                                <p className="text-base">Standard AI Insights</p>
                            </div>
                            <div className="mt-2 flex items-center">
                                <img src="https://assets.website-files.com/6458c625291a94a195e6cf3a/6458c625291a94a84be6cf60_check-mark.svg" alt="" className="mr-2 inline-block w-4" />
                                <p className="text-base">Email Support</p>
                            </div>
                        </div>

                        {/* Price - Growth */}
                        <div className="mx-auto flex w-full max-w-md flex-col items-start rounded-md border border-gray-300 bg-gray-100 p-8 text-indigo-900">
                            <div className="mb-4 rounded-md bg-black px-4 py-1.5">
                                <p className="text-sm font-bold text-white sm:text-sm">GROWTH</p>
                            </div>
                            <p className="mb-6 text-base font-light text-gray-500 md:mb-10 lg:mb-12">
                                Perfect for growing teams needing advanced features.
                            </p>
                            <h2 className="mb-5 text-3xl font-bold md:text-5xl lg:mb-8">
                                $149<span className="text-sm font-light sm:text-sm">/year</span>
                            </h2>
                            <a href="#" className="mb-5 w-full rounded-md bg-black px-6 py-3 text-center font-semibold text-white md:mb-6 lg:mb-8">
                                Get Started
                            </a>
                            <div className="mt-2 flex items-center">
                                <img src="https://assets.website-files.com/6458c625291a94a195e6cf3a/6458c625291a94a84be6cf60_check-mark.svg" alt="" className="mr-2 inline-block w-4" />
                                <p className="text-base">Multi-File Integration</p>
                            </div>
                            <div className="mt-2 flex items-center">
                                <img src="https://assets.website-files.com/6458c625291a94a195e6cf3a/6458c625291a94a84be6cf60_check-mark.svg" alt="" className="mr-2 inline-block w-4" />
                                <p className="text-base">Advanced AI Analysis</p>
                            </div>
                            <div className="mt-2 flex items-center">
                                <img src="https://assets.website-files.com/6458c625291a94a195e6cf3a/6458c625291a94a84be6cf60_check-mark.svg" alt="" className="mr-2 inline-block w-4" />
                                <p className="text-base">Priority Support</p>
                            </div>
                        </div>

                        {/* Price - Premium */}
                        <div className="mx-auto flex w-full max-w-md flex-col items-start rounded-md border border-gray-300 p-8 text-indigo-900">
                            <div className="mb-4 rounded-md bg-black px-4 py-1.5">
                                <p className="text-sm font-bold text-white sm:text-sm">PREMIUM</p>
                            </div>
                            <p className="mb-6 text-base font-light text-gray-500 md:mb-10 lg:mb-12">
                                Best for enterprises with complex data needs.
                            </p>
                            <h2 className="mb-5 text-3xl font-bold md:text-5xl lg:mb-8">
                                $299<span className="text-sm font-light sm:text-sm">/year</span>
                            </h2>
                            <a href="#" className="mb-5 w-full rounded-md bg-black px-6 py-3 text-center font-semibold text-white lg:mb-8">
                                Get Started
                            </a>
                            <div className="mt-2 flex items-center">
                                <img src="https://assets.website-files.com/6458c625291a94a195e6cf3a/6458c625291a94a84be6cf60_check-mark.svg" alt="" className="mr-2 inline-block w-4" />
                                <p className="text-base">Unlimited File Integration</p>
                            </div>
                            <div className="mt-2 flex items-center">
                                <img src="https://assets.website-files.com/6458c625291a94a195e6cf3a/6458c625291a94a84be6cf60_check-mark.svg" alt="" className="mr-2 inline-block w-4" />
                                <p className="text-base">Custom AI Prompts</p>
                            </div>
                            <div className="mt-2 flex items-center">
                                <img src="https://assets.website-files.com/6458c625291a94a195e6cf3a/6458c625291a94a84be6cf60_check-mark.svg" alt="" className="mr-2 inline-block w-4" />
                                <p className="text-base">24/7 Premium Support</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <Footer />
        </>
    );
}