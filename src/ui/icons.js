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
  List,
  Layers, 
  HardDrive,
  Pin,
  Star,
  Clock,
  Upload,
  LogOut,
  MoreVertical,
  ArrowUpDown,
  CheckSquare,
  Square,
  Eye,
  Tag,
  Copy,
  ExternalLink,
  ShieldAlert,
  Loader2,
  QrCode,
  Phone,
  KeyRound,
  ShieldCheck,
  ArrowRight
} from 'lucide';

/**
 * Converts Lucide icon element definitions `[ [tag, attrs], [tag, attrs], ... ]`
 * directly into a valid SVG DOM Element.
 */
export function createIcon(iconDef, customAttrs = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  const size = customAttrs.size || 16;
  const stroke = customAttrs.color || 'currentColor';
  const strokeWidth = customAttrs.strokeWidth || 2;

  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', stroke);
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  if (Array.isArray(iconDef)) {
    for (const item of iconDef) {
      if (Array.isArray(item) && item.length >= 2) {
        const [tag, attrs] = item;
        const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const [key, val] of Object.entries(attrs || {})) {
          el.setAttribute(key, String(val));
        }
        svg.appendChild(el);
      }
    }
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
  List,
  Layers, 
  HardDrive,
  Pin,
  Star,
  Clock,
  Upload,
  LogOut,
  MoreVertical,
  ArrowUpDown,
  CheckSquare,
  Square,
  Eye,
  Tag,
  Copy,
  ExternalLink,
  ShieldAlert,
  Loader2,
  QrCode,
  Phone,
  KeyRound,
  ShieldCheck,
  ArrowRight
};
