// components/Navigation.tsx (only the signed-in chunk changed)
{isSignedIn ? (
  <div className="flex items-center gap-3">
    <Link href="/profile" className="flex items-center text-sm text-gray-700 hover:text-gray-900">
      <User className="w-4 h-4 mr-1" />
      {user?.firstName || "Profile"}
    </Link>
    <SignOutButton>
      <Button variant="outline">
        <LogOut className="w-4 h-4 mr-2" />
        Sign Out
      </Button>
    </SignOutButton>
  </div>
) : (/* ... */)}
