import Link from "next/link"

export default function Component() {
  return (
    <div className="flex min-h-screen items-center px-4 py-12 sm:px-6 md:px-8 lg:px-12 xl:px-16">
      <div className="w-full space-y-6 text-center">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tighter transition-transform hover:scale-110 sm:text-5xl">
            404
          </h1>
          <h3 className="text-lg text-red-600">⚠️ Page not found!</h3>
          <p className="text-muted-foreground">
            Looks like you&apos;ve ventured into the unknown digital realm.
          </p>
        </div>
        <Link
          href="/"
          className="mt-4 inline-block rounded bg-[#ff8237] px-4 py-2 text-foreground hover:bg-[#bb6530]"
          prefetch={false}
        >
          Return to home
        </Link>
      </div>
    </div>
  )
}
