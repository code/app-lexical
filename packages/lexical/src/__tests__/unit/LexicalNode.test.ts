/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {
  $create,
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  createEditor,
  DecoratorNode,
  EditorConfig,
  ElementNode,
  LexicalEditor,
  NodeKey,
  ParagraphNode,
  RangeSelection,
  SerializedLexicalNode,
  SerializedTextNode,
  TextNode,
} from 'lexical';

import {LexicalNode} from '../../LexicalNode';
import {$createParagraphNode} from '../../nodes/LexicalParagraphNode';
import {$createTextNode} from '../../nodes/LexicalTextNode';
import {
  $createTestInlineElementNode,
  initializeUnitTest,
  TestElementNode,
  TestInlineElementNode,
} from '../utils';

export class TestNode extends LexicalNode {
  static getType(): string {
    return 'test';
  }

  static clone(node: TestNode) {
    return new TestNode(node.__key);
  }

  createDOM() {
    return document.createElement('div');
  }

  static importJSON(serializedNode: SerializedLexicalNode) {
    return new TestNode().updateFromJSON(serializedNode);
  }
}

class InlineDecoratorNode extends DecoratorNode<string> {
  static getType(): string {
    return 'inline-decorator';
  }

  static clone(): InlineDecoratorNode {
    return new InlineDecoratorNode();
  }

  static importJSON(serializedNode: SerializedLexicalNode) {
    return new InlineDecoratorNode().updateFromJSON(serializedNode);
  }

  createDOM(): HTMLElement {
    return document.createElement('span');
  }

  isInline(): true {
    return true;
  }

  isParentRequired(): true {
    return true;
  }

  decorate() {
    return 'inline-decorator';
  }
}

describe('LexicalNode tests', () => {
  beforeAll(() => {
    jest.spyOn(LexicalNode, 'getType').mockImplementation(() => 'node');
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });
  initializeUnitTest(
    (testEnv) => {
      let paragraphNode: ParagraphNode;
      let textNode: TextNode;

      beforeEach(async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const rootNode = $getRoot();
          paragraphNode = new ParagraphNode();
          textNode = new TextNode('foo');
          paragraphNode.append(textNode);
          rootNode.append(paragraphNode);
        });
      });

      test('LexicalNode.constructor', async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const node = new LexicalNode('__custom_key__');
          expect(node.__type).toBe('node');
          expect(node.__key).toBe('__custom_key__');
          expect(node.__parent).toBe(null);
        });

        await editor.getEditorState().read(() => {
          expect(() => new LexicalNode()).toThrow();
          expect(() => new LexicalNode('__custom_key__')).toThrow();
        });
      });

      test('LexicalNode.constructor: type change detected', async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const validNode = new TextNode(textNode.__text, textNode.__key);
          expect(textNode.getLatest()).toBe(textNode);
          expect(validNode.getLatest()).toBe(textNode);
          expect(() => new TestNode(textNode.__key)).toThrowError(
            /TestNode.*re-use key.*TextNode/,
          );
        });
      });

      test('LexicalNode.clone()', async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const node = new LexicalNode('__custom_key__');

          expect(() => LexicalNode.clone(node)).toThrow();
        });
      });
      test('LexicalNode.afterCloneFrom()', () => {
        class VersionedTextNode extends TextNode {
          // ['constructor']!: KlassConstructor<typeof VersionedTextNode>;
          __version = 0;
          static getType(): 'vtext' {
            return 'vtext';
          }
          static clone(node: VersionedTextNode): VersionedTextNode {
            return new VersionedTextNode(node.__text, node.__key);
          }
          static importJSON(node: SerializedTextNode): VersionedTextNode {
            throw new Error('Not implemented');
          }
          afterCloneFrom(node: this): void {
            super.afterCloneFrom(node);
            this.__version = node.__version + 1;
          }
        }
        const editor = createEditor({
          nodes: [VersionedTextNode],
          onError(err) {
            throw err;
          },
        });
        let versionedTextNode: VersionedTextNode;

        editor.update(
          () => {
            versionedTextNode = new VersionedTextNode('test');
            $getRoot().append($createParagraphNode().append(versionedTextNode));
            expect(versionedTextNode.__version).toEqual(0);
          },
          {discrete: true},
        );
        editor.update(
          () => {
            expect(versionedTextNode.getLatest().__version).toEqual(0);
            expect(
              versionedTextNode.setTextContent('update').setMode('token')
                .__version,
            ).toEqual(1);
          },
          {discrete: true},
        );
        editor.update(
          () => {
            let latest = versionedTextNode.getLatest();
            expect(versionedTextNode.__version).toEqual(0);
            expect(versionedTextNode.__mode).toEqual(0);
            expect(versionedTextNode.getMode()).toEqual('token');
            expect(latest.__version).toEqual(1);
            expect(latest.__mode).toEqual(1);
            latest = latest.setTextContent('another update');
            expect(latest.__version).toEqual(2);
            expect(latest.getWritable().__version).toEqual(2);
            expect(
              versionedTextNode.getLatest().getWritable().__version,
            ).toEqual(2);
            expect(versionedTextNode.getLatest().__version).toEqual(2);
            expect(versionedTextNode.__mode).toEqual(0);
            expect(versionedTextNode.getLatest().__mode).toEqual(1);
            expect(versionedTextNode.getMode()).toEqual('token');
          },
          {discrete: true},
        );
      });

      test('LexicalNode.getType()', async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const node = new LexicalNode('__custom_key__');
          expect(node.getType()).toEqual(node.__type);
        });
      });

      test('LexicalNode.isAttached()', async () => {
        const {editor} = testEnv;
        let node: LexicalNode;

        await editor.update(() => {
          node = new LexicalNode('__custom_key__');
        });

        await editor.getEditorState().read(() => {
          expect(node.isAttached()).toBe(false);
          expect(textNode.isAttached()).toBe(true);
          expect(paragraphNode.isAttached()).toBe(true);
        });

        expect(() => textNode.isAttached()).toThrow();
      });

      test('LexicalNode.isSelected()', async () => {
        const {editor} = testEnv;
        let node: LexicalNode;

        await editor.update(() => {
          node = new LexicalNode('__custom_key__');
        });

        await editor.getEditorState().read(() => {
          expect(node.isSelected()).toBe(false);
          expect(textNode.isSelected()).toBe(false);
          expect(paragraphNode.isSelected()).toBe(false);
        });

        await editor.update(() => {
          textNode.select(0, 0);
        });

        await editor.getEditorState().read(() => {
          expect(textNode.isSelected()).toBe(true);
        });

        expect(() => textNode.isSelected()).toThrow();
      });

      test('LexicalNode.isSelected(): selected text node', async () => {
        const {editor} = testEnv;

        await editor.getEditorState().read(() => {
          expect(paragraphNode.isSelected()).toBe(false);
          expect(textNode.isSelected()).toBe(false);
        });

        await editor.update(() => {
          textNode.select(0, 0);
        });

        await editor.getEditorState().read(() => {
          expect(textNode.isSelected()).toBe(true);
          expect(paragraphNode.isSelected()).toBe(false);
        });
      });

      test('LexicalNode.isSelected(): selected block node range', async () => {
        const {editor} = testEnv;
        let newParagraphNode: ParagraphNode;
        let newTextNode: TextNode;

        await editor.update(() => {
          expect(paragraphNode.isSelected()).toBe(false);
          expect(textNode.isSelected()).toBe(false);
          newParagraphNode = new ParagraphNode();
          newTextNode = new TextNode('bar');
          newParagraphNode.append(newTextNode);
          paragraphNode.insertAfter(newParagraphNode);
          expect(newParagraphNode.isSelected()).toBe(false);
          expect(newTextNode.isSelected()).toBe(false);
        });

        await editor.update(() => {
          textNode.select(0, 0);
          const selection = $getSelection();

          expect(selection).not.toBe(null);

          if (!$isRangeSelection(selection)) {
            return;
          }

          selection.anchor.set(textNode.getKey(), 1, 'text');
          selection.focus.set(newTextNode.getKey(), 1, 'text');
        });

        await Promise.resolve().then();

        await editor.update(() => {
          const selection = $getSelection();

          if (!$isRangeSelection(selection)) {
            return;
          }

          expect(selection.anchor.key).toBe(textNode.getKey());
          expect(selection.focus.key).toBe(newTextNode.getKey());
          expect(paragraphNode.isSelected()).toBe(true);
          expect(textNode.isSelected()).toBe(true);
          expect(newParagraphNode.isSelected()).toBe(true);
          expect(newTextNode.isSelected()).toBe(true);
        });
      });

      test('LexicalNode.isSelected(): with custom range selection', async () => {
        const {editor} = testEnv;
        let newParagraphNode: ParagraphNode;
        let newTextNode: TextNode;

        await editor.update(() => {
          expect(paragraphNode.isSelected()).toBe(false);
          expect(textNode.isSelected()).toBe(false);
          newParagraphNode = new ParagraphNode();
          newTextNode = new TextNode('bar');
          newParagraphNode.append(newTextNode);
          paragraphNode.insertAfter(newParagraphNode);
          expect(newParagraphNode.isSelected()).toBe(false);
          expect(newTextNode.isSelected()).toBe(false);
        });

        await editor.update(() => {
          const rangeSelection = $createRangeSelection();

          rangeSelection.anchor.set(textNode.getKey(), 1, 'text');
          rangeSelection.focus.set(newTextNode.getKey(), 1, 'text');

          expect(paragraphNode.isSelected(rangeSelection)).toBe(true);
          expect(textNode.isSelected(rangeSelection)).toBe(true);
          expect(newParagraphNode.isSelected(rangeSelection)).toBe(true);
          expect(newTextNode.isSelected(rangeSelection)).toBe(true);
        });

        await Promise.resolve().then();
      });

      describe('LexicalNode.isSelected(): with inline decorator node', () => {
        let editor: LexicalEditor;
        let paragraphNode1: ParagraphNode;
        let paragraphNode2: ParagraphNode;
        let paragraphNode3: ParagraphNode;
        let inlineDecoratorNode: InlineDecoratorNode;
        let names: Record<NodeKey, string>;
        beforeEach(() => {
          editor = testEnv.editor;
          editor.update(() => {
            inlineDecoratorNode = new InlineDecoratorNode();
            paragraphNode1 = $createParagraphNode();
            paragraphNode2 = $createParagraphNode().append(inlineDecoratorNode);
            paragraphNode3 = $createParagraphNode();
            names = {
              [inlineDecoratorNode.getKey()]: 'd',
              [paragraphNode1.getKey()]: 'p1',
              [paragraphNode2.getKey()]: 'p2',
              [paragraphNode3.getKey()]: 'p3',
            };
            $getRoot()
              .clear()
              .append(paragraphNode1, paragraphNode2, paragraphNode3);
          });
        });
        const cases: {
          label: string;
          isSelected: boolean;
          update: () => void;
        }[] = [
          {
            isSelected: true,
            label: 'whole editor',
            update() {
              $getRoot().select(0);
            },
          },
          {
            isSelected: true,
            label: 'containing paragraph',
            update() {
              paragraphNode2.select(0);
            },
          },
          {
            isSelected: true,
            label: 'before and containing',
            update() {
              paragraphNode2
                .select(0)
                .anchor.set(paragraphNode1.getKey(), 0, 'element');
            },
          },
          {
            isSelected: true,
            label: 'containing and after',
            update() {
              paragraphNode2
                .select(0)
                .focus.set(paragraphNode3.getKey(), 0, 'element');
            },
          },
          {
            isSelected: true,
            label: 'before and after',
            update() {
              paragraphNode1
                .select(0)
                .focus.set(paragraphNode3.getKey(), 0, 'element');
            },
          },
          {
            isSelected: false,
            label: 'collapsed before',
            update() {
              paragraphNode2.select(0, 0);
            },
          },
          {
            isSelected: false,
            label: 'in another element',
            update() {
              paragraphNode1.select(0);
            },
          },
          {
            isSelected: false,
            label: 'before',
            update() {
              paragraphNode1
                .select(0)
                .focus.set(paragraphNode2.getKey(), 0, 'element');
            },
          },
          {
            isSelected: false,
            label: 'collapsed after',
            update() {
              paragraphNode2.selectEnd();
            },
          },
          {
            isSelected: false,
            label: 'after',
            update() {
              paragraphNode3
                .select(0)
                .anchor.set(
                  paragraphNode2.getKey(),
                  paragraphNode2.getChildrenSize(),
                  'element',
                );
            },
          },
        ];
        for (const {label, isSelected, update} of cases) {
          test(`${isSelected ? 'is' : "isn't"} selected ${label}`, () => {
            editor.update(update);
            const $verify = () => {
              const selection = $getSelection() as RangeSelection;
              expect($isRangeSelection(selection)).toBe(true);
              const dbg = [selection.anchor, selection.focus]
                .map(
                  (point) =>
                    `(${names[point.key] || point.key}:${point.offset})`,
                )
                .join(' ');
              const nodes = `[${selection
                .getNodes()
                .map((k) => names[k.__key] || k.__key)
                .join(',')}]`;
              expect([dbg, nodes, inlineDecoratorNode.isSelected()]).toEqual([
                dbg,
                nodes,
                isSelected,
              ]);
            };
            editor.read($verify);
            editor.update(() => {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                const backwards = $createRangeSelection();
                backwards.anchor.set(
                  selection.focus.key,
                  selection.focus.offset,
                  selection.focus.type,
                );
                backwards.focus.set(
                  selection.anchor.key,
                  selection.anchor.offset,
                  selection.anchor.type,
                );
                $setSelection(backwards);
              }
              expect($isRangeSelection(selection)).toBe(true);
            });
            editor.read($verify);
          });
        }
      });

      test('LexicalNode.getKey()', async () => {
        expect(textNode.getKey()).toEqual(textNode.__key);
      });

      test('LexicalNode.getParent()', async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const node = new LexicalNode();
          expect(node.getParent()).toBe(null);
        });

        await editor.getEditorState().read(() => {
          const rootNode = $getRoot();
          expect(textNode.getParent()).toBe(paragraphNode);
          expect(paragraphNode.getParent()).toBe(rootNode);
        });
        expect(() => textNode.getParent()).toThrow();
      });

      test('LexicalNode.getParentOrThrow()', async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const node = new LexicalNode();
          expect(() => node.getParentOrThrow()).toThrow();
        });

        await editor.getEditorState().read(() => {
          const rootNode = $getRoot();
          expect(textNode.getParent()).toBe(paragraphNode);
          expect(paragraphNode.getParent()).toBe(rootNode);
        });
        expect(() => textNode.getParentOrThrow()).toThrow();
      });

      test('LexicalNode.getTopLevelElement()', async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const node = new LexicalNode();
          expect(node.getTopLevelElement()).toBe(null);
        });

        await editor.getEditorState().read(() => {
          expect(textNode.getTopLevelElement()).toBe(paragraphNode);
          expect(paragraphNode.getTopLevelElement()).toBe(paragraphNode);
        });
        expect(() => textNode.getTopLevelElement()).toThrow();
        await editor.update(() => {
          const node = new InlineDecoratorNode();
          expect(node.getTopLevelElement()).toBe(null);
          $getRoot().append(node);
          expect(node.getTopLevelElement()).toBe(node);
        });
        editor.getEditorState().read(() => {
          const elementNodes: ElementNode[] = [];
          const decoratorNodes: DecoratorNode<unknown>[] = [];
          for (const child of $getRoot().getChildren()) {
            expect(child.getTopLevelElement()).toBe(child);
            if ($isElementNode(child)) {
              elementNodes.push(child);
            } else if ($isDecoratorNode(child)) {
              decoratorNodes.push(child);
            } else {
              throw new Error(
                'Expecting all children to be ElementNode or DecoratorNode',
              );
            }
          }
          expect(decoratorNodes).toHaveLength(1);
          expect(elementNodes).toHaveLength(1);
        });
      });

      test('LexicalNode.getTopLevelElementOrThrow()', async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const node = new LexicalNode();
          expect(() => node.getTopLevelElementOrThrow()).toThrow();
        });

        await editor.getEditorState().read(() => {
          expect(textNode.getTopLevelElementOrThrow()).toBe(paragraphNode);
          expect(paragraphNode.getTopLevelElementOrThrow()).toBe(paragraphNode);
        });
        expect(() => textNode.getTopLevelElementOrThrow()).toThrow();
        await editor.update(() => {
          const node = new InlineDecoratorNode();
          expect(() => node.getTopLevelElementOrThrow()).toThrow();
          $getRoot().append(node);
          expect(node.getTopLevelElementOrThrow()).toBe(node);
        });
      });

      test('LexicalNode.getParents()', async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const node = new LexicalNode();
          expect(node.getParents()).toEqual([]);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );

        await editor.getEditorState().read(() => {
          const rootNode = $getRoot();
          expect(textNode.getParents()).toEqual([paragraphNode, rootNode]);
          expect(paragraphNode.getParents()).toEqual([rootNode]);
        });
        expect(() => textNode.getParents()).toThrow();
      });

      test('LexicalNode.getPreviousSibling()', async () => {
        const {editor} = testEnv;
        let barTextNode: TextNode;

        await editor.update(() => {
          barTextNode = new TextNode('bar');
          barTextNode.toggleUnmergeable();
          paragraphNode.append(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span><span data-lexical-text="true">bar</span></p></div>',
        );

        await editor.getEditorState().read(() => {
          expect(barTextNode.getPreviousSibling()).toEqual({
            ...textNode,
            __next: '3',
          });
          expect(textNode.getPreviousSibling()).toEqual(null);
        });
        expect(() => textNode.getPreviousSibling()).toThrow();
      });

      test('LexicalNode.getPreviousSiblings()', async () => {
        const {editor} = testEnv;
        let barTextNode: TextNode;
        let bazTextNode: TextNode;

        await editor.update(() => {
          barTextNode = new TextNode('bar');
          barTextNode.toggleUnmergeable();
          bazTextNode = new TextNode('baz');
          bazTextNode.toggleUnmergeable();
          paragraphNode.append(barTextNode, bazTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span><span data-lexical-text="true">bar</span><span data-lexical-text="true">baz</span></p></div>',
        );

        await editor.getEditorState().read(() => {
          expect(bazTextNode.getPreviousSiblings()).toEqual([
            {
              ...textNode,
              __next: '3',
            },
            {
              ...barTextNode,
              __prev: '2',
            },
          ]);
          expect(barTextNode.getPreviousSiblings()).toEqual([
            {
              ...textNode,
              __next: '3',
            },
          ]);
          expect(textNode.getPreviousSiblings()).toEqual([]);
        });
        expect(() => textNode.getPreviousSiblings()).toThrow();
      });

      test('LexicalNode.getNextSibling()', async () => {
        const {editor} = testEnv;
        let barTextNode: TextNode;

        await editor.update(() => {
          barTextNode = new TextNode('bar');
          barTextNode.toggleUnmergeable();
          paragraphNode.append(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span><span data-lexical-text="true">bar</span></p></div>',
        );

        await editor.getEditorState().read(() => {
          expect(barTextNode.getNextSibling()).toEqual(null);
          expect(textNode.getNextSibling()).toEqual(barTextNode);
        });
        expect(() => textNode.getNextSibling()).toThrow();
      });

      test('LexicalNode.getNextSiblings()', async () => {
        const {editor} = testEnv;
        let barTextNode: TextNode;
        let bazTextNode: TextNode;

        await editor.update(() => {
          barTextNode = new TextNode('bar');
          barTextNode.toggleUnmergeable();
          bazTextNode = new TextNode('baz');
          bazTextNode.toggleUnmergeable();
          paragraphNode.append(barTextNode, bazTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span><span data-lexical-text="true">bar</span><span data-lexical-text="true">baz</span></p></div>',
        );

        await editor.getEditorState().read(() => {
          expect(bazTextNode.getNextSiblings()).toEqual([]);
          expect(barTextNode.getNextSiblings()).toEqual([bazTextNode]);
          expect(textNode.getNextSiblings()).toEqual([
            barTextNode,
            bazTextNode,
          ]);
        });
        expect(() => textNode.getNextSiblings()).toThrow();
      });

      test('LexicalNode.getCommonAncestor()', async () => {
        const {editor} = testEnv;
        let quxTextNode: TextNode;
        let barParagraphNode: ParagraphNode;
        let barTextNode: TextNode;
        let bazParagraphNode: ParagraphNode;
        let bazTextNode: TextNode;

        await editor.update(() => {
          const rootNode = $getRoot();
          barParagraphNode = new ParagraphNode();
          barTextNode = new TextNode('bar');
          barTextNode.toggleUnmergeable();
          bazParagraphNode = new ParagraphNode();
          bazTextNode = new TextNode('baz');
          bazTextNode.toggleUnmergeable();
          expect(bazTextNode.getCommonAncestor(bazTextNode)).toBe(null);
          quxTextNode = new TextNode('qux');
          quxTextNode.toggleUnmergeable();
          paragraphNode.append(quxTextNode);
          expect(barTextNode.getCommonAncestor(bazTextNode)).toBe(null);
          barParagraphNode.append(barTextNode);
          bazParagraphNode.append(bazTextNode);
          expect(barTextNode.getCommonAncestor(bazTextNode)).toBe(null);
          expect(bazTextNode.getCommonAncestor(bazTextNode)).toBe(
            bazParagraphNode,
          );
          rootNode.append(barParagraphNode, bazParagraphNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span><span data-lexical-text="true">qux</span></p><p dir="ltr"><span data-lexical-text="true">bar</span></p><p dir="ltr"><span data-lexical-text="true">baz</span></p></div>',
        );

        await editor.getEditorState().read(() => {
          const rootNode = $getRoot();
          expect(textNode.getCommonAncestor(rootNode)).toBe(rootNode);
          expect(quxTextNode.getCommonAncestor(rootNode)).toBe(rootNode);
          expect(barTextNode.getCommonAncestor(rootNode)).toBe(rootNode);
          expect(bazTextNode.getCommonAncestor(rootNode)).toBe(rootNode);
          expect(textNode.getCommonAncestor(quxTextNode)).toBe(
            paragraphNode.getLatest(),
          );
          expect(barTextNode.getCommonAncestor(bazTextNode)).toBe(rootNode);
          expect(barTextNode.getCommonAncestor(bazTextNode)).toBe(rootNode);
        });

        expect(() => textNode.getCommonAncestor(barTextNode)).toThrow();
      });

      test('LexicalNode.isBefore()', async () => {
        const {editor} = testEnv;
        let barTextNode: TextNode;
        let bazTextNode: TextNode;

        await editor.update(() => {
          barTextNode = new TextNode('bar');
          barTextNode.toggleUnmergeable();
          bazTextNode = new TextNode('baz');
          bazTextNode.toggleUnmergeable();
          paragraphNode.append(barTextNode, bazTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span><span data-lexical-text="true">bar</span><span data-lexical-text="true">baz</span></p></div>',
        );

        await editor.getEditorState().read(() => {
          expect(textNode.isBefore(textNode)).toBe(false);
          expect(textNode.isBefore(barTextNode)).toBe(true);
          expect(textNode.isBefore(bazTextNode)).toBe(true);
          expect(barTextNode.isBefore(bazTextNode)).toBe(true);
          expect(bazTextNode.isBefore(barTextNode)).toBe(false);
          expect(bazTextNode.isBefore(textNode)).toBe(false);
        });
        expect(() => textNode.isBefore(barTextNode)).toThrow();
      });

      test('LexicalNode.isParentOf()', async () => {
        const {editor} = testEnv;

        await editor.getEditorState().read(() => {
          const rootNode = $getRoot();
          expect(rootNode.isParentOf(textNode)).toBe(true);
          expect(rootNode.isParentOf(paragraphNode)).toBe(true);
          expect(paragraphNode.isParentOf(textNode)).toBe(true);
          expect(paragraphNode.isParentOf(rootNode)).toBe(false);
          expect(textNode.isParentOf(paragraphNode)).toBe(false);
          expect(textNode.isParentOf(rootNode)).toBe(false);
        });
        expect(() => paragraphNode.isParentOf(textNode)).toThrow();
      });

      test('LexicalNode.getNodesBetween()', async () => {
        const {editor} = testEnv;
        let barTextNode: TextNode;
        let bazTextNode: TextNode;
        let newParagraphNode: ParagraphNode;
        let quxTextNode: TextNode;

        await editor.update(() => {
          const rootNode = $getRoot();
          barTextNode = new TextNode('bar');
          barTextNode.toggleUnmergeable();
          bazTextNode = new TextNode('baz');
          bazTextNode.toggleUnmergeable();
          newParagraphNode = new ParagraphNode();
          quxTextNode = new TextNode('qux');
          quxTextNode.toggleUnmergeable();
          rootNode.append(newParagraphNode);
          paragraphNode.append(barTextNode, bazTextNode);
          newParagraphNode.append(quxTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span><span data-lexical-text="true">bar</span><span data-lexical-text="true">baz</span></p><p dir="ltr"><span data-lexical-text="true">qux</span></p></div>',
        );

        await editor.getEditorState().read(() => {
          expect(textNode.getNodesBetween(textNode)).toEqual([textNode]);
          expect(textNode.getNodesBetween(barTextNode)).toEqual([
            textNode,
            barTextNode,
          ]);
          expect(textNode.getNodesBetween(bazTextNode)).toEqual([
            textNode,
            barTextNode,
            bazTextNode,
          ]);
          expect(textNode.getNodesBetween(quxTextNode)).toEqual([
            textNode,
            barTextNode,
            bazTextNode,
            paragraphNode.getLatest(),
            newParagraphNode,
            quxTextNode,
          ]);
        });
        expect(() => textNode.getNodesBetween(bazTextNode)).toThrow();
      });

      test('LexicalNode.isToken()', async () => {
        const {editor} = testEnv;
        let tokenTextNode: TextNode;

        await editor.update(() => {
          tokenTextNode = new TextNode('token').setMode('token');
          paragraphNode.append(tokenTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span><span data-lexical-text="true">token</span></p></div>',
        );

        await editor.getEditorState().read(() => {
          expect(textNode.isToken()).toBe(false);
          expect(tokenTextNode.isToken()).toBe(true);
        });
        expect(() => textNode.isToken()).toThrow();
      });

      test('LexicalNode.isSegmented()', async () => {
        const {editor} = testEnv;
        let segmentedTextNode: TextNode;

        await editor.update(() => {
          segmentedTextNode = new TextNode('segmented').setMode('segmented');
          paragraphNode.append(segmentedTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span><span data-lexical-text="true">segmented</span></p></div>',
        );

        await editor.getEditorState().read(() => {
          expect(textNode.isSegmented()).toBe(false);
          expect(segmentedTextNode.isSegmented()).toBe(true);
        });
        expect(() => textNode.isSegmented()).toThrow();
      });

      test('LexicalNode.isDirectionless()', async () => {
        const {editor} = testEnv;
        let directionlessTextNode: TextNode;

        await editor.update(() => {
          directionlessTextNode = new TextNode(
            'directionless',
          ).toggleDirectionless();
          directionlessTextNode.toggleUnmergeable();
          paragraphNode.append(directionlessTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span><span data-lexical-text="true">directionless</span></p></div>',
        );

        await editor.getEditorState().read(() => {
          expect(textNode.isDirectionless()).toBe(false);
          expect(directionlessTextNode.isDirectionless()).toBe(true);
        });
        expect(() => directionlessTextNode.isDirectionless()).toThrow();
      });

      test('LexicalNode.getLatest()', async () => {
        const {editor} = testEnv;

        await editor.getEditorState().read(() => {
          expect(textNode.getLatest()).toBe(textNode);
        });
        expect(() => textNode.getLatest()).toThrow();
      });

      test('LexicalNode.getLatest(): garbage collected node', async () => {
        const {editor} = testEnv;
        let node: LexicalNode;
        let text: TextNode;
        let block: TestElementNode;

        await editor.update(() => {
          node = new LexicalNode();
          node.getLatest();
          text = new TextNode('');
          text.getLatest();
          block = new TestElementNode();
          block.getLatest();
        });

        await editor.update(() => {
          expect(() => node.getLatest()).toThrow();
          expect(() => text.getLatest()).toThrow();
          expect(() => block.getLatest()).toThrow();
        });
      });

      test('LexicalNode.getTextContent()', async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const node = new LexicalNode();
          expect(node.getTextContent()).toBe('');
        });

        await editor.getEditorState().read(() => {
          expect(textNode.getTextContent()).toBe('foo');
        });
        expect(() => textNode.getTextContent()).toThrow();
      });

      test('LexicalNode.getTextContentSize()', async () => {
        const {editor} = testEnv;

        await editor.getEditorState().read(() => {
          expect(textNode.getTextContentSize()).toBe('foo'.length);
        });
        expect(() => textNode.getTextContentSize()).toThrow();
      });

      test('LexicalNode.createDOM()', async () => {
        const {editor} = testEnv;

        editor.update(() => {
          const node = new LexicalNode();
          expect(() =>
            node.createDOM(
              {
                namespace: '',
                theme: {},
              },
              editor,
            ),
          ).toThrow();
        });
      });

      test('LexicalNode.updateDOM()', async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const node = new LexicalNode();
          // @ts-expect-error
          expect(() => node.updateDOM()).toThrow();
        });
      });

      test('LexicalNode.remove()', async () => {
        const {editor} = testEnv;

        await editor.getEditorState().read(() => {
          expect(() => textNode.remove()).toThrow();
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );

        await editor.update(() => {
          const node = new LexicalNode();
          node.remove();
          expect(node.getParent()).toBe(null);
          textNode.remove();
          expect(textNode.getParent()).toBe(null);
          expect(editor._dirtyLeaves.has(textNode.getKey()));
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p><br></p></div>',
        );
        expect(() => textNode.remove()).toThrow();
      });

      test('LexicalNode.replace()', async () => {
        const {editor} = testEnv;

        await editor.getEditorState().read(() => {
          // @ts-expect-error
          expect(() => textNode.replace()).toThrow();
        });
        expect(() => textNode.remove()).toThrow();
      });

      test('LexicalNode.replace(): from another parent', async () => {
        const {editor} = testEnv;

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );
        let barTextNode: TextNode;

        await editor.update(() => {
          const rootNode = $getRoot();
          const barParagraphNode = new ParagraphNode();
          barTextNode = new TextNode('bar');
          barParagraphNode.append(barTextNode);
          rootNode.append(barParagraphNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p><p dir="ltr"><span data-lexical-text="true">bar</span></p></div>',
        );

        await editor.update(() => {
          textNode.replace(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">bar</span></p><p dir="ltr"><br></p></div>',
        );
      });

      test('LexicalNode.replace(): text', async () => {
        const {editor} = testEnv;

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );

        await editor.update(() => {
          const barTextNode = new TextNode('bar');
          textNode.replace(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">bar</span></p></div>',
        );
      });

      test('LexicalNode.replace(): token', async () => {
        const {editor} = testEnv;

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );

        await editor.update(() => {
          const barTextNode = new TextNode('bar').setMode('token');
          textNode.replace(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">bar</span></p></div>',
        );
      });

      test('LexicalNode.replace(): segmented', async () => {
        const {editor} = testEnv;

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );

        await editor.update(() => {
          const barTextNode = new TextNode('bar').setMode('segmented');
          textNode.replace(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">bar</span></p></div>',
        );
      });

      test('LexicalNode.replace(): directionless', async () => {
        const {editor} = testEnv;

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );

        await editor.update(() => {
          const barTextNode = new TextNode(`bar`).toggleDirectionless();
          textNode.replace(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p><span data-lexical-text="true">bar</span></p></div>',
        );
        // TODO: add text direction validations
      });

      test('LexicalNode.replace() within canBeEmpty: false', async () => {
        const {editor} = testEnv;

        jest
          .spyOn(TestInlineElementNode.prototype, 'canBeEmpty')
          .mockReturnValue(false);

        await editor.update(() => {
          textNode = $createTextNode('Hello');

          $getRoot()
            .clear()
            .append(
              $createParagraphNode().append(
                $createTestInlineElementNode().append(textNode),
              ),
            );

          textNode.replace($createTextNode('world'));
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p><a dir="ltr"><span data-lexical-text="true">world</span></a></p></div>',
        );
      });

      test('LexicalNode.insertAfter()', async () => {
        const {editor} = testEnv;

        await editor.getEditorState().read(() => {
          // @ts-expect-error
          expect(() => textNode.insertAfter()).toThrow();
        });
        // @ts-expect-error
        expect(() => textNode.insertAfter()).toThrow();
      });

      test('LexicalNode.insertAfter(): text', async () => {
        const {editor} = testEnv;

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );

        await editor.update(() => {
          const barTextNode = new TextNode('bar');
          textNode.insertAfter(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foobar</span></p></div>',
        );
      });

      test('LexicalNode.insertAfter(): token', async () => {
        const {editor} = testEnv;

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );

        await editor.update(() => {
          const barTextNode = new TextNode('bar').setMode('token');
          textNode.insertAfter(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span><span data-lexical-text="true">bar</span></p></div>',
        );
      });

      test('LexicalNode.insertAfter(): segmented', async () => {
        const {editor} = testEnv;

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );

        await editor.update(() => {
          const barTextNode = new TextNode('bar').setMode('token');
          textNode.insertAfter(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span><span data-lexical-text="true">bar</span></p></div>',
        );
      });

      test('LexicalNode.insertAfter(): directionless', async () => {
        const {editor} = testEnv;

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );

        await editor.update(() => {
          const barTextNode = new TextNode(`bar`).toggleDirectionless();
          textNode.insertAfter(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foobar</span></p></div>',
        );
        // TODO: add text direction validations
      });

      test('LexicalNode.insertAfter() move blocks around', async () => {
        const {editor} = testEnv;
        let block1: ParagraphNode,
          block2: ParagraphNode,
          block3: ParagraphNode,
          text1: TextNode,
          text2: TextNode,
          text3: TextNode;

        await editor.update(() => {
          const root = $getRoot();
          root.clear();
          block1 = new ParagraphNode();
          block2 = new ParagraphNode();
          block3 = new ParagraphNode();
          text1 = new TextNode('A');
          text2 = new TextNode('B');
          text3 = new TextNode('C');
          block1.append(text1);
          block2.append(text2);
          block3.append(text3);
          root.append(block1, block2, block3);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">A</span></p><p dir="ltr"><span data-lexical-text="true">B</span></p><p dir="ltr"><span data-lexical-text="true">C</span></p></div>',
        );

        await editor.update(() => {
          text1.insertAfter(block2);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">A</span><p dir="ltr"><span data-lexical-text="true">B</span></p></p><p dir="ltr"><span data-lexical-text="true">C</span></p></div>',
        );
      });

      test('LexicalNode.insertAfter() move blocks around #2', async () => {
        const {editor} = testEnv;
        let block1: ParagraphNode,
          block2: ParagraphNode,
          block3: ParagraphNode,
          text1: TextNode,
          text2: TextNode,
          text3: TextNode;

        await editor.update(() => {
          const root = $getRoot();
          root.clear();
          block1 = new ParagraphNode();
          block2 = new ParagraphNode();
          block3 = new ParagraphNode();
          text1 = new TextNode('A');
          text1.toggleUnmergeable();
          text2 = new TextNode('B');
          text2.toggleUnmergeable();
          text3 = new TextNode('C');
          text3.toggleUnmergeable();
          block1.append(text1);
          block2.append(text2);
          block3.append(text3);
          root.append(block1);
          root.append(block2);
          root.append(block3);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">A</span></p><p dir="ltr"><span data-lexical-text="true">B</span></p><p dir="ltr"><span data-lexical-text="true">C</span></p></div>',
        );

        await editor.update(() => {
          text3.insertAfter(text1);
          text3.insertAfter(text2);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p><br></p><p><br></p><p dir="ltr"><span data-lexical-text="true">C</span><span data-lexical-text="true">B</span><span data-lexical-text="true">A</span></p></div>',
        );
      });

      test('LexicalNode.insertBefore()', async () => {
        const {editor} = testEnv;

        await editor.getEditorState().read(() => {
          // @ts-expect-error
          expect(() => textNode.insertBefore()).toThrow();
        });
        // @ts-expect-error
        expect(() => textNode.insertBefore()).toThrow();
      });

      test('LexicalNode.insertBefore(): from another parent', async () => {
        const {editor} = testEnv;

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );
        let barTextNode;

        await editor.update(() => {
          const rootNode = $getRoot();
          const barParagraphNode = new ParagraphNode();
          barTextNode = new TextNode('bar');
          barParagraphNode.append(barTextNode);
          rootNode.append(barParagraphNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p><p dir="ltr"><span data-lexical-text="true">bar</span></p></div>',
        );
      });

      test('LexicalNode.insertBefore(): text', async () => {
        const {editor} = testEnv;

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );

        await editor.update(() => {
          const barTextNode = new TextNode('bar');
          textNode.insertBefore(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">barfoo</span></p></div>',
        );
      });

      test('LexicalNode.insertBefore(): token', async () => {
        const {editor} = testEnv;

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );

        await editor.update(() => {
          const barTextNode = new TextNode('bar').setMode('token');
          textNode.insertBefore(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">bar</span><span data-lexical-text="true">foo</span></p></div>',
        );
      });

      test('LexicalNode.insertBefore(): segmented', async () => {
        const {editor} = testEnv;

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );

        await editor.update(() => {
          const barTextNode = new TextNode('bar').setMode('segmented');
          textNode.insertBefore(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">bar</span><span data-lexical-text="true">foo</span></p></div>',
        );
      });

      test('LexicalNode.insertBefore(): directionless', async () => {
        const {editor} = testEnv;

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">foo</span></p></div>',
        );

        await editor.update(() => {
          const barTextNode = new TextNode(`bar`).toggleDirectionless();
          textNode.insertBefore(barTextNode);
        });

        expect(testEnv.outerHTML).toBe(
          '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p><span data-lexical-text="true">barfoo</span></p></div>',
        );
      });

      test('LexicalNode.selectNext()', async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const barTextNode = new TextNode('bar');
          textNode.insertAfter(barTextNode);

          expect(barTextNode.isSelected()).not.toBe(true);

          textNode.selectNext();

          expect(barTextNode.isSelected()).toBe(true);
          // TODO: additional validation of anchorOffset and focusOffset
        });
      });

      test('LexicalNode.selectNext(): no next sibling', async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const selection = textNode.selectNext();
          expect(selection.anchor.getNode()).toBe(paragraphNode);
          expect(selection.anchor.offset).toBe(1);
        });
      });

      test('LexicalNode.selectNext(): non-text node', async () => {
        const {editor} = testEnv;

        await editor.update(() => {
          const barNode = new TestNode();
          textNode.insertAfter(barNode);
          const selection = textNode.selectNext();

          expect(selection.anchor.getNode()).toBe(textNode.getParent());
          expect(selection.anchor.offset).toBe(1);
        });
      });
      describe('LexicalNode.$config()', () => {
        test('importJSON() with no boilerplate', () => {
          class CustomTextNode extends TextNode {
            $config() {
              return this.config('custom-text', {extends: TextNode});
            }
          }
          const editor = createEditor({
            nodes: [CustomTextNode],
            onError(err) {
              throw err;
            },
          });
          editor.update(
            () => {
              const node = CustomTextNode.importJSON({
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'codegen!',
                type: 'custom-text',
                version: 1,
              });
              expect(node).toBeInstanceOf(CustomTextNode);
              expect(node.getType()).toBe('custom-text');
              expect(node.getTextContent()).toBe('codegen!');
            },
            {discrete: true},
          );
        });
        test('clone() with no boilerplate', () => {
          class SNCVersionedTextNode extends TextNode {
            __version = 0;
            $config() {
              return this.config('snc-vtext', {});
            }
            afterCloneFrom(node: this): void {
              super.afterCloneFrom(node);
              this.__version = node.__version + 1;
            }
          }
          const editor = createEditor({
            nodes: [SNCVersionedTextNode],
            onError(err) {
              throw err;
            },
          });
          let versionedTextNode: SNCVersionedTextNode;

          editor.update(
            () => {
              versionedTextNode =
                $create(SNCVersionedTextNode).setTextContent('test');
              $getRoot().append(
                $createParagraphNode().append(versionedTextNode),
              );
              expect(versionedTextNode.__version).toEqual(0);
            },
            {discrete: true},
          );
          editor.update(
            () => {
              expect(versionedTextNode.getLatest().__version).toEqual(0);
              const latest = versionedTextNode
                .setTextContent('update')
                .setMode('token');
              expect(latest).toMatchObject({
                __text: 'update',
                __version: 1,
              });
              expect(versionedTextNode).toMatchObject({
                __text: 'test',
                __version: 0,
              });
            },
            {discrete: true},
          );
          editor.update(
            () => {
              let latest = versionedTextNode.getLatest();
              expect(versionedTextNode.__version).toEqual(0);
              expect(versionedTextNode.__mode).toEqual(0);
              expect(versionedTextNode.getMode()).toEqual('token');
              expect(latest.__version).toEqual(1);
              expect(latest.__mode).toEqual(1);
              latest = latest.setTextContent('another update');
              expect(latest.__version).toEqual(2);
              expect(latest.getWritable().__version).toEqual(2);
              expect(
                versionedTextNode.getLatest().getWritable().__version,
              ).toEqual(2);
              expect(versionedTextNode.getLatest().__version).toEqual(2);
              expect(versionedTextNode.__mode).toEqual(0);
              expect(versionedTextNode.getLatest().__mode).toEqual(1);
              expect(versionedTextNode.getMode()).toEqual('token');
            },
            {discrete: true},
          );
        });
      });
    },
    {
      namespace: '',
      nodes: [LexicalNode, TestNode, InlineDecoratorNode],
      theme: {},
    },
  );
});

// These are outside of the above suite because of the
// LexicalNode getType mock which ruins it
describe('LexicalNode.$config() without registration', () => {
  test('static getType() before registration', () => {
    class IncorrectCustomDecoratorNode extends DecoratorNode<null> {
      decorate(editor: LexicalEditor, config: EditorConfig): null {
        return null;
      }
    }
    class CorrectCustomDecoratorNode extends DecoratorNode<null> {
      decorate(editor: LexicalEditor, config: EditorConfig): null {
        return null;
      }
      $config() {
        return this.config('correct-custom-decorator', {});
      }
    }
    // Run twice to make sure that getStaticNodeConfig doesn't cache the wrong thing
    for (let i = 0; i < 2; i++) {
      expect(() => IncorrectCustomDecoratorNode.getType()).toThrow(
        /does not implement \.getType/,
      );
      expect(CorrectCustomDecoratorNode.getType()).toEqual(
        'correct-custom-decorator',
      );
    }
  });
});
