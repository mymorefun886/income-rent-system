import React from "react";

const tones = {
  slate: "bg-[#03457e] text-white",
  sand: "bg-[#caf0f8] text-[#023e8a]",
  gold: "bg-[#90e0ef] text-[#023e8a]",
  teal: "bg-[#0096c7] text-white",
  rose: "bg-[#0077b6] text-white",
};

const StatsCard = ({ title, value, hint, icon: Icon, tone = "sand" }) => (
  <div className={`rounded-[28px] p-5 shadow-sm ${tones[tone] || tones.sand}`}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm opacity-80">{title}</p>
        <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
        {hint ? <p className="mt-2 text-sm opacity-75">{hint}</p> : null}
      </div>
      {Icon ? (
        <div className="rounded-2xl bg-white/15 p-3">
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
    </div>
  </div>
);

export default StatsCard;
