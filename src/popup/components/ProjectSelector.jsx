import React from 'react';
import { Menu } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';

export default function ProjectSelector({ projects, currentProject, onSelect }) {
  return (
    <Menu as="div" className="relative">
      <Menu.Button className="w-full inline-flex justify-between items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
        {currentProject?.name || 'Select Project'}
        <ChevronDownIcon className="ml-2 h-5 w-5 text-gray-400" aria-hidden="true" />
      </Menu.Button>

      <Menu.Items className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
        {projects.map((project) => (
          <Menu.Item key={project.id}>
            {({ active }) => (
              <button
                onClick={() => onSelect(project)}
                className={`${
                  active ? 'bg-indigo-600 text-white' : 'text-gray-900'
                } group flex items-center w-full px-4 py-2 text-sm`}
              >
                {project.name}
              </button>
            )}
          </Menu.Item>
        ))}
      </Menu.Items>
    </Menu>
  );
}