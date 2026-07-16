// Dark rounded pill with a small label over a value ("Time" / "Answers x/y").
export const StatPill = ({ label, children }) => (
  <div className="flex flex-col items-center rounded-full bg-black/40 px-4 text-lg font-bold">
    <span className="translate-y-1 text-sm">{label}</span>
    <span>{children}</span>
  </div>
)
