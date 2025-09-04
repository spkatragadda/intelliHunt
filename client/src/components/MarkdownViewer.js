import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

function MarkdownViewer() {
  const [markdown, setMarkdown] = useState('');

  useEffect(() => {
    fetch('/api/markdown/') // Use the correct API endpoint URL
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.text();
      })
      .then(data => {
        setMarkdown(data);
      })
      .catch(error => {
        console.error('Error fetching markdown:', error);
      });
  }, []); // The empty dependency array [] ensures this runs only once on page load

  return (
    <div>
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  );
}

export default MarkdownViewer;