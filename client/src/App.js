import React from 'react';
import MarkdownViewer from './components/MarkdownViewer'; // Adjust the path as needed

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>My IntelliHunt App</h1>
      </header>
      <main>
        <MarkdownViewer /> {/* Your component will be displayed here */}
      </main>
    </div>
  );
}

export default App;