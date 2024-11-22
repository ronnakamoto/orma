import React, { useState, useEffect } from 'react';
import { PlusIcon, TrashIcon, Cog6ToothIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import Memory from './Memory';
import Settings from './Settings';
import { vectorService } from '../../services/vectorService';
import db from '../../services/db';

export default function Popup() {
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadProjects();
    initializeVectorService();
  }, []);

  useEffect(() => {
    if (currentProject) {
      loadMemories(currentProject.id);
      chrome.storage.local.set({ currentProjectId: currentProject.id });
    }
  }, [currentProject]);

  async function initializeVectorService() {
    try {
      const setting = await db.getSetting('openai_api_key');
      if (setting?.value) {
        await vectorService.initialize(setting.value);
      }
    } catch (error) {
      console.error('Error initializing vector service:', error);
    }
  }

  async function loadProjects() {
    try {
      const projects = await db.projects.toArray();
      setProjects(projects);
      
      chrome.storage.local.get('currentProjectId', ({ currentProjectId }) => {
        if (currentProjectId) {
          const project = projects.find(p => p.id === currentProjectId);
          if (project) setCurrentProject(project);
        }
      });
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadMemories(projectId) {
    try {
      const memories = await db.memories.where('projectId').equals(projectId).toArray();
      setMemories(memories.sort((a, b) => b.timestamp - a.timestamp));
      // Build graph connections in the background
      vectorService.buildGraphConnections(projectId).catch(console.error);
    } catch (error) {
      console.error('Error loading memories:', error);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim() || !currentProject) return;

    setSearching(true);
    try {
      const results = await vectorService.getContextualizedMemories(
        searchQuery,
        currentProject.id
      );
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching memories:', error);
      if (error.message === 'Vector service not initialized') {
        setShowSettings(true);
      }
    } finally {
      setSearching(false);
    }
  }

  async function handleCreateProject() {
    const name = prompt('Enter project name:');
    if (!name) return;

    try {
      const project = {
        name,
        created: Date.now()
      };
      const id = await db.projects.add(project);
      setProjects([...projects, { ...project, id }]);
    } catch (error) {
      console.error('Error creating project:', error);
    }
  }

  async function handleDeleteMemory(memoryId) {
    if (!confirm('Are you sure you want to delete this memory?')) return;

    try {
      await db.memories.delete(memoryId);
      setMemories(memories.filter(m => m.id !== memoryId));
      if (currentProject) {
        vectorService.buildGraphConnections(currentProject.id).catch(console.error);
      }
    } catch (error) {
      console.error('Error deleting memory:', error);
    }
  }

  async function handleDeleteProject(projectId) {
    if (!confirm('Are you sure you want to delete this project and all its memories?')) return;

    try {
      await db.projects.delete(projectId);
      await db.memories.where('projectId').equals(projectId).delete();
      await db.graph.where('projectId').equals(projectId).delete();

      setProjects(projects.filter(p => p.id !== projectId));
      if (currentProject?.id === projectId) {
        setCurrentProject(null);
        setMemories([]);
      }
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  }

  return (
    <div className="w-[400px] h-[600px] bg-gray-50 text-gray-900 font-space-grotesk overflow-hidden">
      <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <h1 className="text-2xl font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Orma
          </h1>
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 text-gray-400 hover:text-gray-600 focus:outline-none transition-colors duration-300"
          >
            <Cog6ToothIcon className="h-5 w-5" />
          </button>
        </div>
        <button
          onClick={handleCreateProject}
          className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-full text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-300 ease-in-out transform hover:scale-105"
          disabled={loading}
        >
          <PlusIcon className="h-4 w-4 mr-1" />
          New Project
        </button>
      </header>

      <main className="p-6 overflow-y-auto h-[calc(100%-4rem)]">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            <div className="mb-6 space-y-4">
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-300 ease-in-out appearance-none bg-white hover:border-indigo-500"
                value={currentProject?.id || ''}
                onChange={(e) => {
                  const project = projects.find(p => p.id === Number(e.target.value));
                  setCurrentProject(project);
                }}
              >
                <option value="">Select Project</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>

              {currentProject && (
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search memories..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-300 ease-in-out"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={searching}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none transition-colors duration-300"
                  >
                    <MagnifyingGlassIcon className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>

            {currentProject && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-medium text-gray-900">
                    {currentProject.name}
                  </h2>
                  <button
                    onClick={() => handleDeleteProject(currentProject.id)}
                    className="text-sm text-red-600 hover:text-red-800 transition-colors duration-300 ease-in-out hover:underline"
                  >
                    Delete Project
                  </button>
                </div>

                {searching ? (
                  <div className="flex justify-center items-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
                  </div>
                ) : searchResults ? (
                  <div className="space-y-6">
                    {searchResults.similar.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-3">
                          Similar Memories
                        </h3>
                        <div className="space-y-4">
                          {searchResults.similar.map(memory => (
                            <Memory
                              key={memory.id}
                              memory={memory}
                              onDelete={() => handleDeleteMemory(memory.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {searchResults.connected.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-3">
                          Related Memories
                        </h3>
                        <div className="space-y-4">
                          {searchResults.connected.map(memory => (
                            <Memory
                              key={memory.id}
                              memory={memory}
                              onDelete={() => handleDeleteMemory(memory.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setSearchResults(null)}
                      className="text-sm text-gray-500 hover:text-gray-700 transition-colors duration-300"
                    >
                      ← Back to all memories
                    </button>
                  </div>
                ) : memories.length === 0 ? (
                  <p className="text-center text-gray-500 py-8 animate-pulse">
                    No memories yet
                  </p>
                ) : (
                  <div className="space-y-4">
                    {memories.map(memory => (
                      <Memory
                        key={memory.id}
                        memory={memory}
                        onDelete={() => handleDeleteMemory(memory.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}