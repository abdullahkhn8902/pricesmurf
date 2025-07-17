import React from "react";
import { NavbarDemo } from "@/component-app/Navbar";
import { Footer } from "@/component-landing/Footer";

export default function Blog() {
    return (
        <>
            <NavbarDemo />
            <section>
                {/* Container */}
                <div className="mx-auto w-full max-w-7xl px-5 py-24 md:px-10 md:py-30">
                    <div className="text-center mb-12">
                        {/* Title */}
                        <h2 className="mb-4 mt-6 text-3xl font-bold text-indigo-900 md:text-5xl">
                            Latest Pricesmurf News
                        </h2>
                        <p className="text-gray-500 mt-2">
                            Stay updated on AI-driven data solutions
                        </p>
                        {/* Buttons */}
                        <div className="my-10 md:my-20 flex flex-col md:flex-row justify-center gap-3">
                            <button className="px-4 py-2 bg-indigo-900 text-white font-semibold rounded-full">
                                Data Management
                            </button>
                            <button className="px-4 py-2 bg-indigo-900 text-white font-semibold rounded-full">
                                AI Insights
                            </button>
                            <button className="px-4 py-2 bg-indigo-900 text-white font-semibold rounded-full">
                                File Strategies
                            </button>
                            <button className="px-4 py-2 bg-indigo-900 text-white font-semibold rounded-full">
                                Optimization Tips
                            </button>
                        </div>
                    </div>
                    {/* Blog Content */}
                    <div className="max-w-6xl mx-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            {/* Blog Item */}
                            <div className="bg-gray-50 rounded-lg overflow-hidden">
                                <div className="relative h-80">
                                    <img className="h-80 w-full object-cover" src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40" alt="Data Management Update" />
                                    <span className="absolute bottom-5 right-5 bg-indigo-900 text-white text-sm font-semibold px-2.5 py-2 rounded">
                                        Product Updates
                                    </span>
                                </div>
                                <div className="p-4 flex justify-between items-center">
                                    <div>
                                        <h2 className="text-lg font-semibold mt-2 text-indigo-900">
                                            Pricesmurf Released
                                        </h2>
                                        <p>Enhanced data upload and management features launched on July 1, 2025.</p>
                                    </div>

                                </div>
                            </div>

                            {/* Blog Item */}
                            <div className="bg-gray-50 rounded-lg overflow-hidden">
                                <div className="relative h-80">
                                    <img className="h-80 w-full object-cover" src="https://images.unsplash.com/photo-1518773553398-650c184e0bb3" alt="AI Analysis Update" />
                                    <span className="absolute bottom-5 right-5 bg-indigo-900 text-white text-sm font-semibold px-2.5 py-2 rounded">
                                        AI Insights
                                    </span>
                                </div>
                                <div className="p-4 flex justify-between items-center">
                                    <div>
                                        <h2 className="text-lg font-semibold mt-2 text-indigo-900">
                                            New AI Analysis Tools
                                        </h2>
                                        <p>Improved AI prompts added on June 28, 2025, for better insights.</p>
                                    </div>
                                    <button className="cursor-pointer h-14 w-14">

                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Blog Item */}
                            <div className="bg-gray-50 rounded-lg overflow-hidden">
                                <div className="relative h-72">
                                    <img className="h-72 w-full object-cover" src="https://images.unsplash.com/photo-1451187580459-43490279c0fa" alt="File Integration Update" />
                                    <span className="absolute bottom-5 right-5 bg-indigo-900 text-white text-sm font-semibold px-2.5 py-2 rounded">
                                        File Strategies
                                    </span>
                                </div>
                                <div className="p-4">
                                    <h2 className="text-lg font-semibold mt-2 text-indigo-900">
                                        Enhanced File Integration
                                    </h2>
                                    <p className="text-gray-500">
                                        New multi-file support added on July 2, 2025.
                                    </p>
                                </div>
                            </div>
                            {/* Blog Item */}
                            <div className="bg-gray-50 rounded-lg overflow-hidden">
                                <div className="relative h-72">
                                    <img className="h-72 w-full object-cover" src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c" alt="Optimization Update" />
                                    <span className="absolute bottom-5 right-5 bg-indigo-900 text-white text-sm font-semibold px-2.5 py-2 rounded">
                                        Optimization Tips
                                    </span>
                                </div>
                                <div className="p-4">
                                    <h2 className="text-lg font-semibold mt-2 text-indigo-900">
                                        Data Optimization Boost
                                    </h2>
                                    <p className="text-gray-500">
                                        Performance improvements rolled out on July 3, 2025.
                                    </p>
                                </div>
                            </div>
                            {/* Blog Item */}
                            <div className="bg-gray-50 rounded-lg overflow-hidden">
                                <div className="relative h-72">
                                    <img className="h-72 w-full object-cover" src="https://images.unsplash.com/photo-1508385087508-652c0a183b7e" alt="Upcoming Features" />
                                    <span className="absolute bottom-5 right-5 bg-indigo-900 text-white text-sm font-semibold px-2.5 py-2 rounded">
                                        Product Updates
                                    </span>
                                </div>
                                <div className="p-4">
                                    <h2 className="text-lg font-semibold mt-2 text-indigo-900">
                                        Upcoming Features Preview
                                    </h2>
                                    <p className="text-gray-500">
                                        Exciting updates planned for July 2025.
                                    </p>
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