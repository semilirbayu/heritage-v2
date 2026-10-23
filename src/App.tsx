import { useState } from 'react';
import FamilyView from './components/family-view/FamilyView';
import ImportScreen, { type ImportedDataset } from './components/ImportScreen';

export default function App() {
  const [dataset, setDataset] = useState<ImportedDataset | null>(null);

  if (dataset === null) {
    return <ImportScreen onImport={setDataset} />;
  }

  return (
    <FamilyView
      tree={dataset.tree}
      warnings={dataset.warnings}
      onOpenAnother={() => setDataset(null)}
    />
  );
}
