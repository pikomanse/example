import { createEffect, type Component, createSignal } from 'solid-js';
import Pikoman from '@pikoman/ws';

import styles from './App.module.css';

const { SOLID_APP_PIKOMAN_APP } = process.env;

const App: Component = () => {
    const [pikoman, _p] = createSignal(new Pikoman(SOLID_APP_PIKOMAN_APP));
    const [lastMessage, setLastMessage] = createSignal("");
    createEffect(() => {
        const channel = pikoman().listen("main-channel");

        channel.on("latest-notification", (e) => {
            setLastMessage(e.message);
        });
        return () => {
        }
    }, []);
    return (
        <div class={styles.App}>
            Last message: {lastMessage()}
        </div>
    );
};

export default App;
