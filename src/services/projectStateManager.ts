
import { SubtitleBlock, Modification, SubtitleFile } from '../types';

/**
 * @typedef {Object} ProcessedBlock
 * @property {string} original - The original text content.
 * @property {string} translated - The processed/translated result.
 */
export interface ProcessedBlock {
  original: string;
  translated: string;
}

/**
 * @typedef {Object} ProjectState
 * Structure for the project data to be saved.
 */
export interface ProjectState {
  // Required Data Points
  totalChunks: number;
  completedChunks: number;
  remainingChunks: number;
  processedBlocks: ProcessedBlock[];
  fullInputContent: string;
  apiKeyUsed?: string; // Deprecated: never persisted with real API keys
  processedBlockIds: number[];
  modificationsMade: Modification[];
  lastProcessedIndex: number;
  timestamp: string;

  // App Specific Data for Full Restoration
  id: string;
  name: string;
  type: 'SRT' | 'VTT' | 'ASS';
  allBlocks: SubtitleBlock[];
  status: string;
  progress: number;
}


export const getProcessedBlockIds = (blocks: SubtitleBlock[]): number[] => (
  blocks.filter(block => !!block.translatedText && block.translatedText.trim() !== '').map(block => block.id)
);

export const getLastContiguousProcessedIndex = (blocks: SubtitleBlock[]): number => {
  const firstIncompleteIndex = blocks.findIndex(block => !block.translatedText || block.translatedText.trim() === '');
  return firstIncompleteIndex === -1 ? blocks.length - 1 : firstIncompleteIndex - 1;
};

export const buildProjectStateFromFile = (file: SubtitleFile): ProjectState => {
  const processedBlockIds = getProcessedBlockIds(file.blocks);
  const completedChunks = processedBlockIds.length;
  return {
    id: file.id,
    name: file.name,
    type: file.type,
    status: file.status,
    progress: file.blocks.length > 0 ? (completedChunks / file.blocks.length) * 100 : 0,
    allBlocks: file.blocks,
    totalChunks: file.blocks.length,
    completedChunks,
    remainingChunks: Math.max(0, file.blocks.length - completedChunks),
    processedBlocks: file.blocks
      .filter(block => !!block.translatedText && block.translatedText.trim() !== '')
      .map(block => ({ original: block.originalText, translated: block.translatedText! })),
    processedBlockIds,
    fullInputContent: '',
    apiKeyUsed: '',
    modificationsMade: file.modificationsMade || [],
    lastProcessedIndex: getLastContiguousProcessedIndex(file.blocks),
    timestamp: new Date().toISOString()
  };
};

const ProjectStateManager = (() => {
  const STORAGE_PREFIX = 'submaster_proj_v1_';

  const _getKey = (projectId: string) => `${STORAGE_PREFIX}${projectId}`;

  return {
    /**
     * Serializes and saves the project state to localStorage.
     */
    saveProjectState: (projectId: string, state: ProjectState): boolean => {
      const stateToSave = {
        ...state,
        timestamp: new Date().toISOString()
      };

      try {
        const serializedState = JSON.stringify(stateToSave);
        const key = _getKey(projectId);
        
        localStorage.setItem(key, serializedState);
        // console.log(`[ProjectStateManager] Saved state for ${projectId}`);
        return true;

      } catch (error: any) {
        if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
          console.error('[ProjectStateManager] Error: LocalStorage is full.');
          // Attempt cleanup: remove oldest project
          const projects = ProjectStateManager.listSavedProjects();
          if (projects.length > 0) {
             // Basic LRU could be implemented here by parsing timestamps, 
             // for now we remove the first key found to try and make space.
             ProjectStateManager.deleteProjectState(projects[0]);
             try {
                localStorage.setItem(_getKey(projectId), JSON.stringify(stateToSave));
                return true;
             } catch(e) { return false; }
          }
        } else {
          console.error('[ProjectStateManager] Error saving state:', error);
        }
        return false;
      }
    },

    /**
     * Retrieves and deserializes the project state.
     */
    loadProjectState: (projectId: string): ProjectState | null => {
      try {
        const key = _getKey(projectId);
        const serializedState = localStorage.getItem(key);

        if (!serializedState) {
          return null;
        }

        const parsed = JSON.parse(serializedState);
        parsed.apiKeyUsed = '';
        if (!Array.isArray(parsed.processedBlockIds)) parsed.processedBlockIds = getProcessedBlockIds(parsed.allBlocks || []);
        parsed.lastProcessedIndex = getLastContiguousProcessedIndex(parsed.allBlocks || []);
        return parsed;
      } catch (error) {
        console.error('[ProjectStateManager] Error parsing state JSON:', error);
        return null;
      }
    },

    /**
     * Removes a specific project state from storage.
     */
    deleteProjectState: (projectId: string) => {
      const key = _getKey(projectId);
      localStorage.removeItem(key);
    },

    /**
     * Lists all project IDs currently saved.
     */
    listSavedProjects: (): string[] => {
      const projects: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          const id = key.substring(STORAGE_PREFIX.length);
          projects.push(id);
        }
      }
      return projects;
    }
  };
})();

export default ProjectStateManager;
