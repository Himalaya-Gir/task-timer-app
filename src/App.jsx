import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './AppContext';
import HomePage from './HomePage';
import StatsPage from './StatsPage';
import LabPage from './LabPage';

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/lab" element={<LabPage />} />
      </Routes>
    </AppProvider>
  );
}
