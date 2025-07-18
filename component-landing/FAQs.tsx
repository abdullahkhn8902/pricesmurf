import React from "react";

export function FAQAccordion() {
    return (
        <section className="bg-white">
            <div className="md:w-1/2 mx-auto p-5  ">
                <div className="space-y-4">
                    <h1 className="text-4xl font-semibold text-indigo-900  m-5 text-center">
                        Frequently Asked Questions<br />
                    </h1>
                    <details className="group [&_summary::-webkit-details-marker]:hidden" open>
                        <summary className="flex items-center justify-between gap-1.5 rounded-md border border-gray-100 bg-gray-50 p-4 text-gray-900">
                            <h2 className="text-lg font-medium">How does Pricesmurf manage company data?</h2>
                            <svg
                                className="size-5 shrink-0 transition-transform duration-300 group-open:-rotate-180"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </summary>
                        <p className="px-4 pt-4 text-gray-900">
                            Pricesmurf offers robust tools to upload, edit, and delete your company data securely, ensuring easy management.
                        </p>
                    </details>

                    <details className="group [&_summary::-webkit-details-marker]:hidden">
                        <summary className="flex items-center justify-between gap-1.5 rounded-md border border-gray-100 bg-gray-50 p-4 text-gray-900">
                            <h2 className="text-lg font-medium">Can I analyze data with custom prompts?</h2>
                            <svg
                                className="size-5 shrink-0 transition-transform duration-300 group-open:-rotate-180"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </summary>
                        <p className="px-4 pt-4 text-gray-900">
                            Yes, Pricesmurf allows you to create custom AI prompts alongside default ones for tailored data analysis.
                        </p>
                    </details>

                    <details className="group [&_summary::-webkit-details-marker]:hidden">
                        <summary className="flex items-center justify-between gap-1.5 rounded-md border border-gray-100 bg-gray-50 p-4 text-gray-900">
                            <h2 className="text-lg font-medium">How do I handle multiple files?</h2>
                            <svg
                                className="size-5 shrink-0 transition-transform duration-300 group-open:-rotate-180"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </summary>
                        <p className="px-4 pt-4 text-gray-900">
                            Pricesmurf enables you to join multiple files and create a unified analysis with ease.
                        </p>
                    </details>
                </div>
            </div>
        </section>
    );
}