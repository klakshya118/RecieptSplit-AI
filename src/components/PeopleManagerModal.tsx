import React, { useState } from 'react';
import { Person } from '../types';
import { PERSON_COLORS, getPersonColorConfig } from '../utils/calculator';
import { X, Plus, Trash2, Users } from 'lucide-react';

interface PeopleManagerModalProps {
  people: Person[];
  onAddPerson: (name: string, color: string) => void;
  onRemovePerson: (personId: string) => void;
  onUpdatePerson: (updated: Person) => void;
  onClose: () => void;
}

export const PeopleManagerModal: React.FC<PeopleManagerModalProps> = ({
  people,
  onAddPerson,
  onRemovePerson,
  onUpdatePerson,
  onClose,
}) => {
  const [newName, setNewName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PERSON_COLORS[0].name);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onAddPerson(newName.trim(), selectedColor);
    setNewName('');
    // Pick next unused color
    const nextColorIdx = (people.length + 1) % PERSON_COLORS.length;
    setSelectedColor(PERSON_COLORS[nextColorIdx].name);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white max-w-md w-full border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-4 border-black">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-black text-white flex items-center justify-center border-2 border-black">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-lg text-black uppercase tracking-tight font-mono">
                PEOPLE ({people.length})
              </h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                Manage group participants
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-black hover:bg-black hover:text-white border-2 border-black transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add Person Form */}
        <form onSubmit={handleAdd} className="mt-4 p-3 bg-neutral-50 border-2 border-black space-y-2.5">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="NAME (E.G. ALEX)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 text-xs px-3 py-2 bg-white border-2 border-black font-bold uppercase placeholder:text-neutral-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="px-4 py-2 bg-black hover:bg-neutral-800 disabled:opacity-30 text-white text-xs font-black uppercase tracking-wider flex items-center space-x-1 border-2 border-black transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ADD</span>
            </button>
          </div>

          {/* Color palette selector */}
          <div className="flex items-center space-x-1.5 pt-1">
            <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mr-1">COLOR:</span>
            {PERSON_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setSelectedColor(c.name)}
                className={`w-5 h-5 border border-black transition-all ${c.bg} ${
                  selectedColor === c.name ? 'ring-2 ring-offset-1 ring-black scale-110' : 'opacity-70 hover:opacity-100'
                }`}
                title={c.name}
              />
            ))}
          </div>
        </form>

        {/* People List */}
        <div className="mt-4 max-h-60 overflow-y-auto space-y-2">
          {people.length === 0 ? (
            <div className="text-center py-6 text-black font-bold text-xs uppercase">
              No participants added yet.
            </div>
          ) : (
            people.map((p) => {
              const colorCfg = getPersonColorConfig(p.color);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2.5 bg-white border-2 border-black"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className={`w-7 h-7 border border-black ${colorCfg.bg} text-white font-black text-xs flex items-center justify-center uppercase font-mono`}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => onUpdatePerson({ ...p, name: e.target.value })}
                      className="text-xs font-black uppercase text-black border-b border-transparent focus:border-black focus:outline-none bg-transparent"
                    />
                  </div>

                  <div className="flex items-center space-x-1">
                    {/* Color switcher dropdown / circle */}
                    <div className="flex items-center space-x-1 mr-2">
                      {PERSON_COLORS.slice(0, 5).map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => onUpdatePerson({ ...p, color: c.name })}
                          className={`w-3.5 h-3.5 border border-black ${c.bg} ${
                            p.color === c.name ? 'ring-1 ring-offset-1 ring-black' : 'opacity-40 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemovePerson(p.id)}
                      className="p-1.5 text-black hover:bg-black hover:text-white border border-black transition-colors"
                      title="Remove person"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t-2 border-black flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-black hover:bg-neutral-800 text-white text-xs font-black uppercase tracking-wider border-2 border-black transition-colors"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
};
