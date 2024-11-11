import React, { useState, useEffect } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import Memory from './Memory';
import { aiService } from '../../services/aiService';

export default function Popup() {
    const [projects, setProjects] = useState([]);
    const [currentProject, setCurrentProject] = useState(null);
    const [memories, setMemories] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadProjects();
    }, []);

    useEffect(() => {
        if (currentProject) {
            loadMemories(currentProject.id);
            chrome.storage.local.set({ currentProjectId: currentProject.id });
        }
    }, [currentProject]);

    useEffect(() => {
        const handleAIOperation = async (message, sender, sendResponse) => {
            if (message.type === 'EXECUTE_AI_OPERATION') {
                try {
                    const result = await aiService[message.operation](
                        ...Object.values(message.data)
                    );
                    sendResponse(result);
                } catch (error) {
                    console.error('Error executing AI operation:', error);
                    sendResponse({ error: error.message });
                }
            }
        };
    
        chrome.runtime.onMessage.addListener(handleAIOperation);
        return () => chrome.runtime.onMessage.removeListener(handleAIOperation);
    }, []);

    async function loadProjects() {
        try {
            const db = await openDB();
            const transaction = db.transaction(['projects'], 'readonly');
            const store = transaction.objectStore('projects');
            const request = store.getAll();

            request.onsuccess = () => {
                setProjects(request.result);
                chrome.storage.local.get('currentProjectId', ({ currentProjectId }) => {
                    if (currentProjectId) {
                        const project = request.result.find(p => p.id === currentProjectId);
                        if (project) setCurrentProject(project);
                    }
                });
            };

            request.onerror = () => {
                console.error('Error loading projects:', request.error);
            };
        } catch (error) {
            console.error('Error loading projects:', error);
        } finally {
            setLoading(false);
        }
    }

    async function loadMemories(projectId) {
        try {
            const db = await openDB();
            const transaction = db.transaction(['memories'], 'readonly');
            const store = transaction.objectStore('memories');
            const index = store.index('projectId');
            const request = index.getAll(projectId);

            request.onsuccess = () => {
                setMemories(request.result.sort((a, b) => b.timestamp - a.timestamp));
            };

            request.onerror = () => {
                console.error('Error loading memories:', request.error);
            };
        } catch (error) {
            console.error('Error loading memories:', error);
        }
    }

    async function handleNewProject() {
        const name = prompt('Enter project name:');
        if (!name) return;

        try {
            const db = await openDB();
            const transaction = db.transaction(['projects'], 'readwrite');
            const store = transaction.objectStore('projects');
            
            const request = store.add({
                name,
                created: Date.now()
            });

            request.onsuccess = () => {
                loadProjects();
            };
        } catch (error) {
            console.error('Error creating project:', error);
        }
    }

    async function handleDeleteMemory(memoryId) {
        if (!confirm('Are you sure you want to delete this memory?')) return;

        try {
            const db = await openDB();
            const transaction = db.transaction(['memories'], 'readwrite');
            const store = transaction.objectStore('memories');
            
            const request = store.delete(memoryId);

            request.onsuccess = () => {
                setMemories(memories.filter(m => m.id !== memoryId));
            };
        } catch (error) {
            console.error('Error deleting memory:', error);
        }
    }

    async function handleDeleteProject(projectId) {
        if (!confirm('Are you sure you want to delete this project and all its memories?')) return;

        try {
            const db = await openDB();
            const transaction = db.transaction(['projects', 'memories'], 'readwrite');
            const projectStore = transaction.objectStore('projects');
            const memoryStore = transaction.objectStore('memories');
            
            await projectStore.delete(projectId);
            
            const memoryIndex = memoryStore.index('projectId');
            const memories = await memoryIndex.getAll(projectId);
            for (const memory of memories) {
                await memoryStore.delete(memory.id);
            }

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
        <div className="w-[400px] h-[600px] bg-gray-50 text-gray-900 font-sans overflow-hidden">
            <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
                <h1 className="text-2xl font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Orma</h1>
                <button
                    onClick={handleNewProject}
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
                        <div className="mb-6">
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
                        </div>

                        {currentProject && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="flex justify-between items-center">
                                    <h2 className="text-lg font-medium text-gray-900">{currentProject.name}</h2>
                                    <button
                                        onClick={() => handleDeleteProject(currentProject.id)}
                                        className="text-sm text-red-600 hover:text-red-800 transition-colors duration-300 ease-in-out hover:underline"
                                    >
                                        Delete Project
                                    </button>
                                </div>
                                
                                {memories.length === 0 ? (
                                    <p className="text-center text-gray-500 py-8 animate-pulse">No memories yet</p>
                                ) : (
                                    <div className="space-y-4">
                                        {memories.map(memory => (
                                            <Memory 
                                                key={memory.id}
                                                memory={memory}
                                                onDelete={handleDeleteMemory}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}

async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('orma-db', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('projects')) {
                const projectStore = db.createObjectStore('projects', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                projectStore.createIndex('name', 'name');
            }

            if (!db.objectStoreNames.contains('memories')) {
                const memoriesStore = db.createObjectStore('memories', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                memoriesStore.createIndex('projectId', 'projectId');
                memoriesStore.createIndex('timestamp', 'timestamp');
            }
        };
    });
}