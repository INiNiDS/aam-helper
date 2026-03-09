import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class AamFixer implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        // 1. Diagnostics-based fixes
        context.diagnostics.forEach(diagnostic => {
            if (diagnostic.code === 'invalidKey') {
                actions.push(this.createFix(document, diagnostic, "Clean key (remove invalid characters)", /[a-zA-Z0-9_\s]/g));
            }
            if (diagnostic.code === 'invalidValue') {
                actions.push(this.createFix(document, diagnostic, "Clean value (remove invalid characters)", /[\x20-\x7Eа-яА-ЯёЁ]/g));
            }
            if (diagnostic.code === 'missingEqual') {
                actions.push(this.createMissingEqualFix(document, diagnostic));
            }
        });

        // 2. Line-based fixes (from secondary plugin)
        const lineText = document.lineAt(range.start.line).text;

        // Quick Fix: Convert // to #
        const commentIndex = lineText.indexOf('//');
        if (commentIndex !== -1 && !lineText.substring(0, commentIndex).includes('"')) {
            const fix = new vscode.CodeAction('Convert to AAM comment (#)', vscode.CodeActionKind.QuickFix);
            fix.edit = new vscode.WorkspaceEdit();
            fix.edit.replace(
                document.uri,
                new vscode.Range(range.start.line, commentIndex, range.start.line, commentIndex + 2),
                '#'
            );
            actions.push(fix);
        }

        // Quick Fix: Convert : to = for assignments
        const assignmentMatch = lineText.match(/^(\s*[a-zA-Z0-9_\-]+)\s*:\s*(.*)$/);
        if (assignmentMatch && !lineText.includes('{') && !lineText.includes('}')) {
            const fix = new vscode.CodeAction('Convert : to = for assignment', vscode.CodeActionKind.QuickFix);
            fix.edit = new vscode.WorkspaceEdit();
            const colonIndex = lineText.indexOf(':');
            fix.edit.replace(
                document.uri,
                new vscode.Range(range.start.line, colonIndex, range.start.line, colonIndex + 1),
                '='
            );
            actions.push(fix);
        }

        // Quick Fix: Quote unquoted string values with spaces
        const valueMatch = lineText.match(/^(\s*[a-zA-Z0-9_\-]+\s*=\s*)([^"].*\s+.*[^"])$/);
        if (valueMatch && !lineText.includes('#')) {
            const valuePart = valueMatch[2].trim();
            const fix = new vscode.CodeAction('Quote string value', vscode.CodeActionKind.QuickFix);
            fix.edit = new vscode.WorkspaceEdit();
            const startPos = lineText.indexOf(valuePart);
            fix.edit.replace(
                document.uri,
                new vscode.Range(range.start.line, startPos, range.start.line, startPos + valuePart.length),
                `"${valuePart}"`
            );
            actions.push(fix);
        }

        return actions;
    }

    private createFix(document: vscode.TextDocument, diagnostic: vscode.Diagnostic, title: string, allowedPattern: RegExp): vscode.CodeAction {
        const fix = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
        fix.diagnostics = [diagnostic];
        fix.isPreferred = true;

        const edit = new vscode.WorkspaceEdit();
        const badText = document.getText(diagnostic.range);
        
        const fixedText = badText.match(allowedPattern)?.join('') || "";
        
        edit.replace(document.uri, diagnostic.range, fixedText);
        fix.edit = edit;
        return fix;
    }

    private createMissingEqualFix(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction {
        const fix = new vscode.CodeAction("Add '='", vscode.CodeActionKind.QuickFix);
        fix.diagnostics = [diagnostic];
        
        const edit = new vscode.WorkspaceEdit();
        const line = document.lineAt(diagnostic.range.start.line);
        const firstWordMatch = line.text.match(/^\s*([^\s=]+)/);
        if (firstWordMatch) {
            const pos = new vscode.Position(line.lineNumber, firstWordMatch[0].length);
            edit.insert(document.uri, pos, " = ");
        }
        
        fix.edit = edit;
        return fix;
    }
}

export function activate(context: vscode.ExtensionContext) {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('aam');
    context.subscriptions.push(diagnosticCollection);

    function updateDiagnostics(document: vscode.TextDocument) {
        if (document.languageId !== 'aam') {
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            if (line.isEmptyOrWhitespace) {continue;}

            const text = line.text;
            const trimmed = text.trim();

            // Ignore comments, and brackets
            if (trimmed.startsWith('#') || trimmed.startsWith('//') || /^[{}[\]]\s*(?:#.*)?$/.test(trimmed)) {
                continue;
            }

            // Ignore fields if they are like "key: value" (not string literals with urls)
            if (/^\s*[a-zA-Z0-9_\-]+(?:\*)?\s*:/.test(trimmed)) {
                continue;
            }

            // Directives
            if (trimmed.startsWith('@')) {
                const validDirectives = ['@schema', '@type', '@import', '@derive'];
                const directiveMatch = trimmed.match(/^(@[a-zA-Z0-9_]+)/);
                if (!directiveMatch || !validDirectives.includes(directiveMatch[1])) {
                    const errorStart = text.indexOf('@');
                    const diag = new vscode.Diagnostic(
                        new vscode.Range(i, errorStart, i, text.length),
                        "Invalid directive. Expected @schema, @type, @import, or @derive.",
                        vscode.DiagnosticSeverity.Error
                    );
                    diag.code = 'invalidDirective';
                    diagnostics.push(diag);
                } else if (directiveMatch[1] === '@type') {
                    if (!trimmed.includes('=')) {
                        const errorStart = text.indexOf('@type');
                        const diag = new vscode.Diagnostic(
                            new vscode.Range(i, errorStart, i, text.length),
                            "Invalid '@type' format. Expected '@type Name = type'.",
                            vscode.DiagnosticSeverity.Error
                        );
                        diag.code = 'invalidTypeDirective';
                        diagnostics.push(diag);
                    }
                }
                continue;
            }

            const equalIndex = text.indexOf('=');

            if (equalIndex === -1) {
                const diag = new vscode.Diagnostic(
                    line.range,
                    "Invalid format. Expected 'key=value'. Missing '='.",
                    vscode.DiagnosticSeverity.Error
                );
                diag.code = 'missingEqual';
                diagnostics.push(diag);
            } else {
                const keyTrimmed = text.substring(0, equalIndex).trim();
                const valueTrimmed = text.substring(equalIndex + 1).trim();
                
                if (keyTrimmed.length === 0) {
                    const diag = new vscode.Diagnostic(new vscode.Range(i, 0, i, equalIndex), "Missing key.", vscode.DiagnosticSeverity.Error);
                    diag.code = 'missingKey';
                    diagnostics.push(diag);
                } else if (!/^[a-zA-Z0-9_\s\-]+$/.test(keyTrimmed)) {
                    const keyStart = text.indexOf(keyTrimmed);
                    const diag = new vscode.Diagnostic(new vscode.Range(i, keyStart, i, equalIndex), "Key contains invalid characters.", vscode.DiagnosticSeverity.Error);
                    diag.code = 'invalidKey';
                    diagnostics.push(diag);
                }

                if (valueTrimmed.length === 0) {
                    const diag = new vscode.Diagnostic(new vscode.Range(i, equalIndex + 1, i, text.length), "Missing value.", vscode.DiagnosticSeverity.Error);
                    diag.code = 'missingValue';
                    diagnostics.push(diag);
                } else {
                    const forbiddenDirectives = ['@schema', '@type', '@import', '@derive'];
                    const foundDirective = forbiddenDirectives.find(d => valueTrimmed.includes(d));

                    if (foundDirective) {
                        const dirStart = text.indexOf(foundDirective, equalIndex + 1);
                        const diag = new vscode.Diagnostic(
                            new vscode.Range(i, dirStart, i, dirStart + foundDirective.length), 
                            `Directives like '${foundDirective}' are not allowed inside values.`, 
                            vscode.DiagnosticSeverity.Error
                        );
                        diag.code = 'forbiddenDirective';
                        diagnostics.push(diag);
                    } 
                    else if (!/^[\x20-\x7Eа-яА-ЯёЁ]+$/.test(valueTrimmed)) {
                        const valStart = text.indexOf(valueTrimmed, equalIndex + 1);
                        const diag = new vscode.Diagnostic(new vscode.Range(i, valStart, i, text.length), "Value contains invalid characters (exotic unicode is forbidden).", vscode.DiagnosticSeverity.Error);
                        diag.code = 'invalidValue';
                        diagnostics.push(diag);
                    }
                }
            }
        }

        // Check for unmatched brackets
        let openBrackets = 0;
        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            let inString = false;
            let quoteChar = '';
            
            for (let j = 0; j < lineText.length; j++) {
                const char = lineText[j];
                if ((char === '"' || char === "'") && (j === 0 || lineText[j-1] !== '\\\\')) {
                    if (!inString) {
                        inString = true;
                        quoteChar = char;
                    } else if (quoteChar === char) {
                        inString = false;
                    }
                }
                if (!inString) {
                    if (char === '#' || (char === '/' && lineText[j+1] === '/')) {
                        break;
                    }
                    if (char === '{') {
                        openBrackets++;
                    } else if (char === '}') {
                        openBrackets--;
                    }
                }
            }
        }
        
        if (openBrackets !== 0) {
            const lastLine = document.lineCount - 1;
            const lastLineLength = document.lineAt(lastLine).text.length;
            const diag = new vscode.Diagnostic(
                new vscode.Range(lastLine, Math.max(0, lastLineLength - 1), lastLine, lastLineLength),
                openBrackets > 0 ? "Unclosed bracket '{'." : "Unmatched closing bracket '}'.",
                vscode.DiagnosticSeverity.Error
            );
            diag.code = 'unmatchedBracket';
            diagnostics.push(diag);
        }

        diagnosticCollection.set(document.uri, diagnostics);
    }

    // Trigger on changes and open
    if (vscode.window.activeTextEditor) {
        updateDiagnostics(vscode.window.activeTextEditor.document);
    }
    
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(editor => {
            if (editor.document.languageId === 'aam') {
                updateDiagnostics(editor.document);
            }
        }),
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.languageId === 'aam') {
                updateDiagnostics(doc);
            }
        }),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.languageId === 'aam') {
                updateDiagnostics(editor.document);
            }
        })
    );

    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider('aam', new AamFixer(), {
            providedCodeActionKinds: AamFixer.providedCodeActionKinds
        })
    );

    // Formatter (auto-linter)
    const formatter = vscode.languages.registerDocumentFormattingEditProvider('aam', {
        provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
            const edits: vscode.TextEdit[] = [];
            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i);
                if (line.isEmptyOrWhitespace) { continue; }

                const text = line.text;
                let newText = text;

                const assignMatch = newText.match(/^([a-zA-Z0-9_\s\-]+?)\s*=\s*(.*?)$/);
                if (assignMatch && !newText.trim().startsWith('@')) {
                    newText = `${assignMatch[1]} = ${assignMatch[2]}`;
                }

                const fieldMatch = newText.match(/^(\s*[a-zA-Z0-9_\-]+(?:\*)?)\s*:\s*(.*)$/);
                if (fieldMatch) {
                    newText = `${fieldMatch[1]}: ${fieldMatch[2]}`;
                }

                if (newText !== text) {
                    edits.push(vscode.TextEdit.replace(line.range, newText));
                }
            }
            return edits;
        }
    });
    context.subscriptions.push(formatter);

    // Definition Provider (Fast Declarations & Go to Definition)
    const definitionProvider = vscode.languages.registerDefinitionProvider('aam', {
        provideDefinition(document, position, _token) {
            const lineText = document.lineAt(position.line).text;
            
            // Check for @import "file.aam"
            const importMatch = lineText.match(/@import\s+"([^"]+)"/);
            if (importMatch) {
                const importPath = importMatch[1];
                const dir = path.dirname(document.uri.fsPath);
                const targetPath = path.join(dir, importPath);
                
                if (fs.existsSync(targetPath)) {
                    return new vscode.Location(
                        vscode.Uri.file(targetPath),
                        new vscode.Position(0, 0)
                    );
                }
            }
            
            // Check for @derive file.aam::SchemaName
            const deriveMatch = lineText.match(/@derive\s+([^:]+)::([a-zA-Z0-9_]+)/);
            if (deriveMatch) {
                const filePath = deriveMatch[1];
                const schemaName = deriveMatch[2];
                const dir = path.dirname(document.uri.fsPath);
                const targetPath = path.join(dir, filePath);
                
                if (fs.existsSync(targetPath)) {
                    const content = fs.readFileSync(targetPath, 'utf8');
                    const lines = content.split(/\r?\n/);
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes(`@schema ${schemaName}`)) {
                            return new vscode.Location(
                                vscode.Uri.file(targetPath),
                                new vscode.Position(i, 0)
                            );
                        }
                    }
                    return new vscode.Location(
                        vscode.Uri.file(targetPath),
                        new vscode.Position(0, 0)
                    );
                }
            }

            // Local symbol resolution (Schema, Type, Alias)
            const range = document.getWordRangeAtPosition(position);
            if (range) {
                const word = document.getText(range);
                // Search current document for definition
                for (let i = 0; i < document.lineCount; i++) {
                    if (i === position.line) {continue;}
                    const lText = document.lineAt(i).text;
                    const schemaMatch = lText.match(new RegExp(`@(schema|type)\\s+${word}\\b`));
                    const aliasMatch = lText.match(new RegExp(`^\\s*${word}\\s*=`));
                    
                    if (schemaMatch || aliasMatch) {
                        return new vscode.Location(
                            document.uri,
                            new vscode.Position(i, lText.indexOf(word))
                        );
                    }
                }
            }

            return null;
        }
    });

    context.subscriptions.push(definitionProvider);

    // Autocomplete Provider
    const completionProvider = vscode.languages.registerCompletionItemProvider('aam', {
        provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
            const completionItems: vscode.CompletionItem[] = [];
            let wordRange = document.getWordRangeAtPosition(position, /@?[a-zA-Z0-9_:]+/);
            
            const linePrefix = document.lineAt(position).text.substring(0, position.character);
            if (!wordRange && linePrefix.endsWith('@')) {
                wordRange = new vscode.Range(position.translate(0, -1), position);
            }

            // Keywords
            const keywords = ['@import', '@schema', '@type', '@derive'];
            keywords.forEach(keyword => {
                const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
                if (wordRange) {
                    item.range = wordRange;
                }
                completionItems.push(item);
            });

            // Types
            const types = [
                // Primitives
                'string', 'int', 'boolean', 'float',
                
                // Base SI Units
                'types::physics::meter', 'types::physics::kilogram', 'types::physics::second', 'types::physics::ampere', 'types::physics::kelvin', 'types::physics::mole', 'types::physics::candela',
                
                // Mechanics
                'types::physics::squaremeter', 'types::physics::cubicmeter', 'types::physics::meterpersecond', 'types::physics::meterpersecondsquared',
                'types::physics::radianpersecond', 'types::physics::radianpersecondsquared', 'types::physics::hertz', 'types::physics::kilogrampercubicmeter',
                'types::physics::kilogrammeterpersecond', 'types::physics::newton', 'types::physics::newtonmeter', 'types::physics::pascal', 'types::physics::joule', 'types::physics::watt',
                'types::physics::newtonpermeter', 'types::physics::kilogramsquaremeter', 'types::physics::newtonsecond', 'types::physics::newtonpercubicmeter',
                'types::physics::joulesecond', 'types::physics::meterpercubicsecond', 'types::physics::radian', 'types::physics::steradian', 'types::physics::dimensionless',
                'types::physics::kilogrampersecond', 'types::physics::cubicmeterpersecond', 'types::physics::newtonpermetersquared',
                
                // Thermodynamics
                'types::physics::jouleperkilogramkelvin', 'types::physics::jouleperkilogram', 'types::physics::jouleperkelvin', 'types::physics::wattpermeterkelvin',
                'types::physics::kelvinperwatt', 'types::physics::voltperkelvin', 'types::physics::celsius', 'types::physics::fahrenheit', 'types::physics::rankine', 'types::physics::calorie',
                'types::physics::britishthermalunit', 'types::physics::langley',
                
                // Electromagnetism
                'types::physics::coulomb', 'types::physics::volt', 'types::physics::ohm', 'types::physics::ohmmeter', 'types::physics::farad', 'types::physics::voltpermeter', 'types::physics::tesla', 'types::physics::weber',
                'types::physics::henry', 'types::physics::siemens', 'types::physics::coulombpercubicmeter', 'types::physics::coulombpersquaremeter', 'types::physics::faradpermeter',
                'types::physics::henrypermeter', 'types::physics::amperepermeter', 'types::physics::amperepersquaremeter', 'types::physics::newtonpercoulomb',
                'types::physics::weberpermeter', 'types::physics::teslasquaremeter', 'types::physics::gauss', 'types::physics::oersted', 'types::physics::maxwell', 'types::physics::gilbert',
                'types::physics::franklin', 'types::physics::debye',
                
                // Optics & Photometry
                'types::physics::dioptre', 'types::physics::lumen', 'types::physics::lux', 'types::physics::lumensecond', 'types::physics::candelapersquaremeter', 'types::physics::wattpersteradian',
                'types::physics::wattpersquaremeter', 'types::physics::joulepersquaremeter', 'types::physics::lambert', 'types::physics::phot', 'types::physics::stilb', 'types::physics::kayser', 'types::physics::jansky',
                
                // Chemistry & Molar Quantities
                'types::physics::kilogrampermole', 'types::physics::cubicmeterperkilogram', 'types::physics::joulepermole', 'types::physics::joulepermolekelvin',
                'types::physics::molepercubicmeter', 'types::physics::katal',
                
                // Radiation & Nuclear Physics
                'types::physics::becquerel', 'types::physics::gray', 'types::physics::sievert', 'types::physics::electronvolt', 'types::physics::barn', 'types::physics::curie', 'types::physics::roentgen',
                'types::physics::rutherford', 'types::physics::fermi', 'types::physics::dalton', 'types::physics::atomicmassunit',
                
                // Astronomy
                'types::physics::lightyear', 'types::physics::parsec', 'types::physics::astronomicalunit', 'types::physics::hubbleconstant', 'types::physics::angstrom',
                
                // Fluid Dynamics & Pressure
                'types::physics::pascalsecond', 'types::physics::squaremeterpersecond', 'types::physics::bar', 'types::physics::millimeterofmercury', 'types::physics::atmosphere',
                'types::physics::torr', 'types::physics::poise', 'types::physics::stokes', 'types::physics::sverdrup', 'types::physics::rayl', 'types::physics::gal',
                
                // Angles
                'types::physics::arcdegree', 'types::physics::arcminute', 'types::physics::arcsecond', 'types::physics::inversemeter',
                
                // Navigation & Speed
                'types::physics::knots', 'types::physics::nauticalmile', 'types::physics::machnumber',
                
                // Information & Communication
                'types::physics::bit', 'types::physics::byte', 'types::physics::decibel', 'types::physics::baud', 'types::physics::erlang',
                
                // Miscellaneous
                'types::physics::percentage', 'types::physics::horsepower', 'types::physics::metabolicequivalent',
                
                // Physics Types
                'types::physics::vector2', 'types::physics::vector3', 'types::physics::vector4',
                'types::physics::quaternion', 'types::physics::matrix3x3', 'types::physics::matrix4x4',
                
                // Time Types
                'types::time::datetime', 'types::time::duration', 'types::time::year', 'types::time::day', 'types::time::hour', 'types::time::minute'
            ];
            
            types.forEach(type => {
                const item = new vscode.CompletionItem(type, vscode.CompletionItemKind.TypeParameter);
                if (wordRange) {
                    item.range = wordRange;
                }
                completionItems.push(item);
            });
            
            // Values
            const values = ['true', 'false'];
            values.forEach(val => {
                const item = new vscode.CompletionItem(val, vscode.CompletionItemKind.Value);
                if (wordRange) {
                    item.range = wordRange;
                }
                completionItems.push(item);
            });

            return completionItems;
        }
    }, '@', ' ');

    context.subscriptions.push(completionProvider);
}

export function deactivate() {}
