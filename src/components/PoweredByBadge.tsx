const PoweredByBadge = () => {
  return (
    <>
      {/* Desktop - fixed bottom right */}
      <div className="fixed bottom-4 right-4 hidden md:block z-50">
        <a href="https://gymkloud.in" target="_blank" rel="noopener noreferrer" className="group relative cursor-pointer">
          {/* Glow effect */}
          <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-emerald-400/20 via-primary/20 to-emerald-400/20 blur-md opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-card/95 backdrop-blur-sm border border-border/60 rounded-full px-5 py-2.5 shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300 flex items-center gap-2.5">
            {/* Active green dot */}
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <p className="text-sm text-muted-foreground">
              Powered by <span className="font-bold text-foreground">GymKloud</span>
            </p>
          </div>
        </div>
      </div>

      {/* Mobile - centered bottom */}
      <div className="py-4 flex justify-center md:hidden">
        <div className="group relative">
          <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-emerald-400/20 via-primary/20 to-emerald-400/20 blur-md opacity-60" />
          <div className="relative bg-card/95 backdrop-blur-sm border border-border/60 rounded-full px-5 py-2.5 shadow-lg flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <p className="text-sm text-muted-foreground">
              Powered by <span className="font-bold text-foreground">GymKloud</span>
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default PoweredByBadge;
