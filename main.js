/*
NEURO-SCAN: GRAPH BUILDER EDITION
Fitur: Auto-Connect [[WikiLinks]] untuk Graph View
*/

const { Plugin, PluginSettingTab, Setting, Notice } = require("obsidian");

// --- 1. SETTINGAN PROMPT AI ---
// Kita suruh Gemini cari hubungan konsep biar bisa jadi Link
const SYSTEM_PROMPT = `
You are a Medical Graph Architect.
Analyze the given text. Identify key medical concepts related to the topic.
Create connections in this JSON format:

[
  { "target": "ConceptName", "relation": "stimulates" },
  { "target": "OtherConcept", "relation": "inhibited_by" }
]

RULES:
1. "target" MUST be a short, singular noun (valid for a WikiLink).
2. "relation" MUST be a short verb/predicate.
3. Return ONLY valid JSON array. No Markdown.
`;

// --- 2. FUNGSI PANGGIL GEMINI (DIRECT) ---
async function callGemini(content, apiKey) {
    if (!apiKey) return null;
    
    // Pakai Gemini 1.5 Flash (Cepat & Murah)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: SYSTEM_PROMPT + "\n\nTEXT:\n" + content }] }]
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "API Error");
        }

        const data = await response.json();
        let text = data.candidates[0].content.parts[0].text;
        
        // Bersihkan kalau Gemini kasih ```json
        text = text.replace(/```json|```/g, "").trim();
        return JSON.parse(text);

    } catch (e) {
        console.error(e);
        new Notice("❌ Error AI: " + e.message);
        return null;
    }
}

// --- 3. LOGIKA PLUGIN ---
module.exports = class NeuroScanPlugin extends Plugin {
    async onload() {
        console.log("Neuro-Scan Loaded!");
        
        // Load Settings
        this.settings = Object.assign({ geminiApiKey: "" }, await this.loadData());
        this.addSettingTab(new NeuroSettingTab(this.app, this));

        // COMMAND PALETTE
        this.addCommand({
            id: 'neuro-connect',
            name: '🧠 Neuro-Scan: Hubungkan ke Graph View',
            editorCallback: async (editor, view) => {
                await this.processNote(view.file);
            }
        });
    }

    async processNote(file) {
        if (!this.settings.geminiApiKey) {
            new Notice("⚠️ Isi API Key dulu di Settings!");
            return;
        }

        new Notice(`🧠 Menganalisa: ${file.basename}...`);
        const content = await this.app.vault.read(file);
        
        // Panggil AI
        const connections = await callGemini(content, this.settings.geminiApiKey);

        if (connections && connections.length > 0) {
            // MAGIC MOMENT: Tulis ke Metadata biar Graph View baca
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                
                // 1. Buat Array Link: [[Jantung]], [[Paru-paru]]
                const links = connections.map(c => `[[${c.target}]]`);
                
                // 2. Simpan di properti "neuro_links" (Otomatis jadi garis di Graph)
                // Kalau sudah ada, kita gabung biar gak nimpa
                const existing = fm['neuro_links'] || [];
                const merged = [...new Set([...existing, ...links])]; // Hapus duplikat
                
                fm['neuro_links'] = merged;
                
                // 3. Simpan detail hubungan (Opsional, buat info aja)
                fm['neuro_details'] = JSON.stringify(connections);
            });

            new Notice(`✅ SUKSES! ${connections.length} koneksi baru ditambahkan.`);
        } else {
            new Notice("⚠️ Tidak menemukan hubungan medis.");
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
};

// --- 4. TAMPILAN SETTING ---
class NeuroSettingTab extends PluginSettingTab {
    constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Neuro-Scan Settings' });

        new Setting(containerEl)
            .setName('Gemini API Key')
            .setDesc('Paste API Key dari Google AI Studio')
            .addText(text => text
                .setPlaceholder('Paste Disini...')
                .setValue(this.plugin.settings.geminiApiKey)
                .onChange(async (val) => {
                    this.plugin.settings.geminiApiKey = val;
                    await this.plugin.saveSettings();
                }));
    }
}
