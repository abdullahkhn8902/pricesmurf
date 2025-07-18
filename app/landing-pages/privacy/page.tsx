"use client";
import React from "react";

import { twMerge } from "tailwind-merge";
import { TracingBeam } from "@/component-landing/ui/tracing-beam";
import { NavbarDemo } from "@/component-app/Navbar";
import { Footer } from "@/component-landing/Footer";

export default function TracingBeamDemo() {
    return (
        <>
            <NavbarDemo />
            <TracingBeam className="px-7 py-20">
                <div className="flex flex-col items-center justify-center px-5 md:px-10">
                    {/* Title Container */}
                    <div className="flex h-auto min-w-[100vw] flex-col items-center justify-end  py-6 md:h-64">
                        <div className="flex flex-col items-center gap-y-4 py-5">
                            <h1 className="text-3xl font-bold md:text-5xl">TERMS OF SERVICE</h1>
                            <p className="text-sm text-[#808080] sm:text-base">
                                Last Updated as of October 17, 2022
                            </p>
                        </div>
                    </div>

                    {/* Content Container */}
                    <div className="mx-auto w-full max-w-5xl py-12 md:py-16 lg:py-20">
                        <div className="flex flex-col items-center gap-y-14">
                            <p className="max-w-3xl text-center text-sm sm:text-base">
                                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse
                                varius enim in eros elementum tristique. Duis cursus, mi quis
                                viverra ornare, eros dolor interdum nulla, ut commodo diam libero
                                vitae erat. Aenean faucibus nibh et justo cursus id rutrum lorem
                                imperdiet. Nunc ut sem vitae risus tristique posuere.
                            </p>

                            <div className="flex min-w-full flex-col gap-y-10">
                                <div className="flex min-w-full py-4 border-b border-[#e2e2e2]">
                                    <h6 className="text-base font-bold">GENERAL TERMS & CONDITIONS</h6>
                                </div>

                                <div className="flex flex-col gap-y-10">
                                    {[
                                        {
                                            title: "SERVICES",
                                            text: "Flowspark offers a comprehensive range of design services, including but not limited to graphic design, web design, branding, illustration, and user interface design. The Company will provide the agreed-upon services with professionalism, creativity, and technical expertise, while adhering to industry standards, design principles, and best practices. The specific details, deliverables, timelines, and pricing for each project will be outlined in a separate agreement or proposal, mutually agreed upon by the Company and the Client.",
                                        },
                                        {
                                            title: "CLIENT RESPONSIBILITIES",
                                            text: "The Client agrees to provide accurate and timely information, materials, and feedback necessary for the successful completion of the project. The Client is responsible for obtaining any necessary permissions, licenses, or copyrights for materials provided to the Company for use in the project, including but not limited to logos, images, text, and any other intellectual property. The Client acknowledges that delays or failures in providing required materials or feedback may impact project timelines, deliverables, and the overall success of the project.",
                                        },
                                        {
                                            title: "INTELLECTUAL PROPERTY",
                                            text: "Any intellectual property rights, including but not limited to copyrights and trademarks, in the final deliverables created by the Company shall be transferred to the Client upon receipt of full payment unless otherwise agreed upon in writing. The Client warrants that any materials provided to the Company for use in the project do not infringe upon the intellectual property rights of any third party.",
                                        },
                                        {
                                            title: "PAYMENT",
                                            text: "The Client agrees to pay the Company the agreed-upon fees for the services rendered. Payment terms, including the amount, method, and schedule, will be specified in the separate agreement or proposal. The Company reserves the right to suspend or terminate services in the event of non-payment or late payment.",
                                        },
                                        {
                                            title: "CONFIDENTIALITY",
                                            text: "The Company and the Client agree to keep confidential any proprietary or sensitive information disclosed during the course of the project. Both parties shall take reasonable measures to protect such information from unauthorized access or disclosure.",
                                        },
                                        {
                                            title: "LIMITATION OF LIABILITY",
                                            text: "The Company shall not be liable for any direct, indirect, incidental, or consequential damages arising out of the use or inability to use the services provided. The Client acknowledges that the Company's liability is limited to the amount paid for the services rendered.",
                                        },
                                        {
                                            title: "TERMINATION",
                                            text: "Either party may terminate this Agreement with written notice if the other party breaches any material provision and fails to remedy the breach within a reasonable time. In the event of termination, the Client shall pay the Company for the services provided up to the termination date.",
                                        },
                                        {
                                            title: "GOVERNING LAW",
                                            text: "This Agreement shall be governed by and construed in accordance with the laws of [Your Jurisdiction]. Any disputes arising out of this Agreement shall be subject to the exclusive jurisdiction of the courts of [Your Jurisdiction].",
                                        },
                                    ].map((section, index) => (
                                        <div key={index} className="flex flex-col items-start gap-y-6">
                                            <div className="flex flex-col items-start gap-y-3">
                                                <p className="text-sm font-bold">{section.title}</p>
                                                <p className="text-sm">{section.text}</p>
                                            </div>
                                        </div>
                                    ))}

                                    <div className="min-h-[1px] min-w-full bg-[#e2e2e2]"></div>

                                    <p className="text-sm">
                                        By accessing, browsing, or utilizing any design services,
                                        communication channels, or materials provided by Flowspark,
                                        including but not limited to graphic design, web design,
                                        branding, illustration, and user interface design, whether
                                        through our website, email, phone, or any other means, you
                                        expressly acknowledge, understand, and agree that you have
                                        carefully read, comprehended, and fully consent to be legally
                                        bound by all the provisions, terms, and conditions set forth in
                                        these Terms of Service, including any additional agreements,
                                        policies, guidelines, or amendments referenced or incorporated
                                        herein.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </TracingBeam>

        </>
    );
}

