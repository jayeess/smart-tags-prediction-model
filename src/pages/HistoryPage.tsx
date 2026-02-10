import { Clock } from "lucide-react";

export default function HistoryPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="w-6 h-6 text-indigo-500" />
          Analysis History
        </h1>
        <p className="text-gray-500 mt-1">
          Previous prediction and tag analysis results
        </p>
      </div>

      <div className="card text-center py-16 text-gray-400">
        <Clock className="w-12 h-12 mx-auto mb-3" />
        <p className="text-sm">
          Analysis history is stored in your browser session.
        </p>
        <p className="text-xs mt-1">
          Run analyses from the Analyze or Table View pages to populate history.
        </p>
      </div>
    </div>
  );
}
