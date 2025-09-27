"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NavbarDemo } from "./Navbar";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const shouldShowNavbar = !pathname.includes("/dashboard"); // ✅ flexible and working
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    return (
        <>
            {shouldShowNavbar && <NavbarDemo />}
            {children}
        </>
    );
}
