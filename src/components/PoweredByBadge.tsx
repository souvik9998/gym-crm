const PoweredByBadge = () => {
  return (
    <div className="fixed bottom-2 left-1/2 -translate-x-1/2 md:bottom-4 md:left-auto md:translate-x-0 md:right-4 z-50 mb-safe">
      <a href="https://gymkloud.in" target="_blank" rel="noopener noreferrer" className="group relative cursor-pointer">
        {/* Glow effect */}
        <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-emerald-400/20 via-primary/20 to-emerald-400/20 blur-md opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative bg-card/95 backdrop-blur-sm border border-border/60 rounded-full px-3 py-1.5 md:px-5 md:py-2.5 shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300 flex items-center gap-1.5 md:gap-2.5">
          {/* Active green dot */}
          <span className="relative flex h-2 w-2 md:h-2.5 md:w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 md:h-2.5 md:w-2.5 bg-emerald-500" />
          </span>
          <p className="text-[10px] md:text-sm text-muted-foreground">
            Powered by <span className="font-bold text-foreground">GymKloud</span>
          </p>
        </div>
      </a>
    </div>
  );
};

export default PoweredByBadge;
