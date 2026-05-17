/**
 * Application shell. Single page for now — header + dashboard.
 */

import Header from './components/Header.jsx';
import DashboardPage from './pages/DashboardPage.jsx';

const App = () => {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <DashboardPage />
    </div>
  );
};

export default App;
