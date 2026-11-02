'use client';

import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import clsx from 'clsx';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  type LucideIcon,
} from 'lucide-react';

interface RichTextEditorProps {
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ onChange, placeholder = 'Type Your Reply...' }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
    ],
    editorProps: { attributes: { class: 'email-body' } },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
  });

  return (
    <div className="rounded-lg bg-surface p-3">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="editor-content mt-2 min-h-[260px] cursor-text" onClick={() => editor?.commands.focus()} />
    </div>
  );
}

const ALIGN_CYCLE = ['left', 'center', 'right'] as const;
const ALIGN_ICONS: Record<(typeof ALIGN_CYCLE)[number], LucideIcon> = { left: AlignLeft, center: AlignCenter, right: AlignRight };

function Toolbar({ editor }: { editor: Editor | null }) {
  const chain = () => editor!.chain().focus();
  const currentAlign = ALIGN_CYCLE.find((a) => editor?.isActive({ textAlign: a })) ?? 'left';
  const nextAlign = ALIGN_CYCLE[(ALIGN_CYCLE.indexOf(currentAlign) + 1) % ALIGN_CYCLE.length];

  const groups: { icon: LucideIcon; label: string; run: () => void; active?: boolean; disabled?: boolean }[][] = [
    [
      { icon: Undo2, label: 'Undo', run: () => chain().undo().run(), disabled: !editor?.can().undo() },
      { icon: Redo2, label: 'Redo', run: () => chain().redo().run(), disabled: !editor?.can().redo() },
    ],
    [{ icon: Heading, label: 'Heading', run: () => chain().toggleHeading({ level: 2 }).run(), active: editor?.isActive('heading') }],
    [
      { icon: Bold, label: 'Bold', run: () => chain().toggleBold().run(), active: editor?.isActive('bold') },
      { icon: Italic, label: 'Italic', run: () => chain().toggleItalic().run(), active: editor?.isActive('italic') },
      { icon: UnderlineIcon, label: 'Underline', run: () => chain().toggleUnderline().run(), active: editor?.isActive('underline') },
    ],
    [{ icon: ALIGN_ICONS[currentAlign], label: `Align ${nextAlign}`, run: () => chain().setTextAlign(nextAlign).run() }],
    [
      { icon: ListOrdered, label: 'Numbered list', run: () => chain().toggleOrderedList().run(), active: editor?.isActive('orderedList') },
      { icon: List, label: 'Bullet list', run: () => chain().toggleBulletList().run(), active: editor?.isActive('bulletList') },
      { icon: IndentIncrease, label: 'Indent', run: () => chain().sinkListItem('listItem').run(), disabled: !editor?.can().sinkListItem('listItem') },
      { icon: IndentDecrease, label: 'Outdent', run: () => chain().liftListItem('listItem').run(), disabled: !editor?.can().liftListItem('listItem') },
      { icon: Quote, label: 'Quote', run: () => chain().toggleBlockquote().run(), active: editor?.isActive('blockquote') },
    ],
    [{ icon: Strikethrough, label: 'Strikethrough', run: () => chain().toggleStrike().run(), active: editor?.isActive('strike') }],
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-full bg-white px-3 py-1" role="toolbar" aria-label="Formatting">
      {groups.map((group, i) => (
        <div key={i} className={clsx('flex items-center gap-0.5', i > 0 && 'border-l border-line pl-1.5')}>
          {group.map(({ icon: Icon, label, run, active, disabled }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={active}
              disabled={!editor || disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={run}
              className={clsx(
                'flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-40',
                active && 'bg-brand-100 text-brand-700',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
