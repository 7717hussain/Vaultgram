import { 
  Folder, 
  Video, 
  Archive, 
  FileText, 
  Image, 
  Music, 
  File, 
  Globe, 
  Lock, 
  PanelLeftClose, 
  PanelLeft, 
  Search, 
  X, 
  Plus, 
  RefreshCw, 
  Smartphone, 
  Key, 
  Settings, 
  ChevronDown, 
  ChevronRight, 
  Download, 
  Check, 
  AlertTriangle, 
  Play, 
  Keyboard, 
  Trash2,
  SlidersHorizontal,
  LayoutGrid,
  Layers,
  HardDrive
} from 'lucide';

// Helper to convert lucide icon definitions to safe DOM SVG elements
export function createIcon(iconDef, attrs = {}) {
  const [tag, defaultAttrs, children = []] = iconDef;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  
  const mergedAttrs = {
    ...defaultAttrs,
    width: attrs.size || defaultAttrs.width || 16,
    height: attrs.size || defaultAttrs.height || 16,
    stroke: attrs.color || 'currentColor',
    'stroke-width': attrs.strokeWidth || defaultAttrs['stroke-width'] || 2,
    fill: 'none',
    ...attrs,
  };

  delete mergedAttrs.size;
  delete mergedAttrs.color;
  delete mergedAttrs.strokeWidth;

  for (const [key, val] of Object.entries(mergedAttrs)) {
    svg.setAttribute(key, val);
  }

  for (const [childTag, childAttrs] of children) {
    const childEl = document.createElementNS('http://www.w3.org/2000/svg', childTag);
    for (const [k, v] of Object.entries(childAttrs)) {
      childEl.setAttribute(k, v);
    }
    svg.appendChild(childEl);
  }

  return svg;
}

export const Icons = {
  Folder,
  Video,
  Archive,
  FileText,
  Image,
  Music,
  File,
  Globe,
  Lock,
  PanelLeftClose,
  PanelLeft,
  Search,
  X,
  Plus,
  RefreshCw,
  Smartphone,
  Key,
  Settings,
  ChevronDown,
  ChevronRight,
  Download,
  Check,
  AlertTriangle,
  Play,
  Keyboard,
  Trash2,
  SlidersHorizontal,
  LayoutGrid,
  Layers,
  HardDrive
};
