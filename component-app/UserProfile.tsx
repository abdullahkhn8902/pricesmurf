"use client";

import { SignedIn, UserButton, useUser } from "@clerk/nextjs";
import { useState, useEffect } from 'react'

export default function UserProfile() {
    const [isClient, setIsClient] = useState(false)

    useEffect(() => {
        setIsClient(true)
    }, [])

    const { user } = useUser();

    return (
        <SignedIn>
            {user && (
                <div className="flex items-center gap-2 text-white">
                    <img
                        src={user.imageUrl}
                        alt={user.fullName || "Avatar"}
                        className="h-10 w-10 shrink-0 rounded-full text-white"
                    />
                    <span>{user.fullName || "User"}</span>
                </div>
            )}
        </SignedIn>
    );
}
