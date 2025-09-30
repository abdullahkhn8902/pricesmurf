'use client';
import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
    SignedIn,
    SignedOut,
    SignInButton,
    SignUpButton,
    UserButton,
} from "@clerk/nextjs";
import { ProductItem, HoveredLink, Menu, MenuItem } from "@/component-landing/ui/navbar-menu";

export function NavbarDemo() {
    return (
        <div className="relative w-full flex items-center justify-center">
            <Navbar className="top-2" />
        </div>
    );
}

function Navbar({ className }: { className?: string }) {
    const pathname = usePathname();

    // Hide navbar on /app-pages/agents and any nested routes like
    // /app-pages/agents/... — change to === if you only want exact match
    if (pathname === '/app-pages/agents' || pathname?.startsWith('/results') || pathname?.startsWith('/margin-results')) {
        return null
    }


    const [active, setActive] = useState<string | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isClient, setIsClient] = useState(false); // for Clerk SSR safety

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (isMobileMenuOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }

        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isMobileMenuOpen]);

    const closeMobileMenu = () => {
        setIsMobileMenuOpen(false);
        setActive(null);
    };

    const menuItems = [
        {
            item: "Features",
            href: "/landing-pages/features",
            content: (
                <div className="text-sm grid grid-cols-1 md:grid-cols-2 gap-4 p-4 text-white">
                    <ProductItem title="File Upload" href="/landing-pages/features" src="/upload.png" description="Easily upload, edit, and delete your company data." />
                    <ProductItem title="Data Management" href="/landing-pages/features" src="/dashboard.png" description="Get instant insights with powerful AI tools." />
                    <ProductItem title="Custom Prompts" href="/landing-pages/features" src="/customprompt.png" description="Combine multiple files for unified analysis." />
                    <ProductItem title="AI Data Analysis" href="/landing-pages/features" src="/aianalyse.png" description="Create tailored AI prompts for specific needs." />
                </div>
            ),
        },
        {
            item: "Pricing",
            href: "/landing-pages/pricing",
            content: (
                <div className="flex flex-col space-y-4 text-sm">
                    <HoveredLink href="/landing-pages/pricing">Basic</HoveredLink>
                    <HoveredLink href="/landing-pages/pricing">Growth</HoveredLink>
                    <HoveredLink href="/landing-pages/pricing">Premium</HoveredLink>
                </div>
            ),
        },
        {
            item: "Blog",
            href: "/landing-pages/blog",
            content: (
                <div className="flex flex-col space-y-4 text-sm py-5">
                    <HoveredLink href="/landing-pages/blog">Data Management Tips</HoveredLink>
                    <HoveredLink href="/landing-pages/blog">AI Insights</HoveredLink>
                    <HoveredLink href="/landing-pages/blog">File Integration Strategies</HoveredLink>
                    <HoveredLink href="/landing-pages/blog">Data Optimization</HoveredLink>
                </div>
            ),
        },
    ];

    return (
        <div className={cn("fixed top-10 inset-x-0 max-w-4xl xl:max-w-6xl mx-auto z-50", className)}>
            <Menu setActive={setActive}>
                <div className="flex items-center w-full">
                    <div className="mr-auto">
                        <Link href="/" onClick={closeMobileMenu}>
                            <img src="/logo.png" alt="Logo" className="h-15 w-auto" />
                        </Link>
                    </div>

                    {/* Desktop menu */}
                    <div className="hidden md:flex justify-center flex-grow space-x-15">
                        {menuItems.map((menu, index) => (
                            <MenuItem
                                key={index}
                                setActive={setActive}
                                active={active}
                                item={menu.item}
                                href={menu.href}
                            >
                                {menu.content}
                            </MenuItem>
                        ))}
                    </div>

                    {/* Clerk Auth - Desktop */}
                    {isClient && (
                        <div className="hidden md:block ml-auto py-3">
                            <SignedOut>
                                <div className="flex gap-4">
                                    <SignInButton mode="modal" >
                                        <button className="rounded-3xl bg-white px-5 py-2.5 text-sm font-medium text-indigo-900 shadow-sm hover:bg-black hover:text-white cursor-pointer">
                                            Login
                                        </button>
                                    </SignInButton>
                                    <SignUpButton mode="modal">
                                        <button className="rounded-3xl bg-gray-100 px-5 py-2.5 text-sm font-medium text-indigo-900 hover:bg-gray-200 cursor-pointer">
                                            Register
                                        </button>
                                    </SignUpButton>
                                </div>
                            </SignedOut>
                            <SignedIn>
                                <UserButton
                                    appearance={{
                                        elements: {
                                            userButtonBox: "flex items-center gap-2",
                                            userButtonTrigger: "hover:bg-gray-100 rounded-full",
                                        },
                                    }}
                                />
                            </SignedIn>
                        </div>
                    )}

                    {/* Mobile menu button */}
                    <div className="md:hidden ml-auto flex items-center text-white">
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="p-2 rounded-md text-white focus:outline-none"
                            aria-label="Toggle menu"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {isMobileMenuOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                )}
                            </svg>
                        </button>
                    </div>
                </div>
            </Menu>

            {/* Mobile menu overlay */}
            {isMobileMenuOpen && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="fixed inset-0 bg-indigo-900 z-40 overflow-y-auto md:hidden"
                >
                    <div className="sticky top-0 bg-indigo-900 z-50 py-4 px-4 flex justify-end border-b border-gray-200 dark:border-gray-200">
                        <button
                            onClick={closeMobileMenu}
                            className="p-2 rounded-full bg-gray-100 dark:bg-gray-100 text-gray-700 dark:text-gray-700"
                            aria-label="Close menu"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Mobile menu items */}
                    <div className="pt-4 pb-8 px-4">
                        <div className="flex flex-col space-y-6">
                            {menuItems.map((menu, index) => (
                                <div key={index}>
                                    <div className="flex justify-between items-center w-full border-b border-gray-200 dark:border-gray-200">
                                        <Link href={menu.href} className="text-xl font-medium py-3 flex-1 text-white" onClick={closeMobileMenu}>
                                            {menu.item}
                                        </Link>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActive(active === menu.item ? null : menu.item);
                                            }}
                                            className="p-2 text-2xl text-white"
                                        >
                                            {active === menu.item ? "−" : "+"}
                                        </button>
                                    </div>
                                    {active === menu.item && (
                                        <div className="pl-4 py-4" onClick={closeMobileMenu}>
                                            {menu.content}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Clerk Auth - Mobile */}
                            {isClient && (
                                <div className="pt-6">
                                    <SignedOut>
                                        <div className="flex flex-col space-y-3">
                                            <SignInButton mode="modal">
                                                <button className="rounded-md bg-white px-5 py-2.5 text-sm font-medium text-indigo-900 shadow-sm hover:bg-black hover:text-white cursor-pointer">
                                                    Login
                                                </button>
                                            </SignInButton>
                                            <SignUpButton mode="modal">
                                                <button className="rounded-md bg-gray-100 px-5 py-2.5 text-sm font-medium text-indigo-900 hover:bg-gray-200 cursor-pointer">
                                                    Register
                                                </button>
                                            </SignUpButton>
                                        </div>
                                    </SignedOut>
                                    <SignedIn>
                                        <div className="flex justify-center pt-3">
                                            <UserButton />
                                        </div>
                                    </SignedIn>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}

export default Navbar;
