const vscode = require('vscode')
const fs = require('fs')
const path = require('path')
const BgTask = require('child_process')

function runFile ( { conn, file, channel, onEnd }) {

    const args = [
        "-d", conn,
        "-f", file,
        "-e"
    ];

    const psql = 'psql'

    const bgtask = BgTask.spawn( psql, args )
    if (!bgtask.pid) return channel.appendLine( `can\'t spawn ${psql}` )

    bgtask.on('error', (err) => {

        const ecode = err.code
        const defmsg = `Failed to spawn ${psql} ${args.join(' ')}. ${ecode}.`
        let message = err.message || defmsg

        if (err.code === 'ENOENT') {
            message = `The ${psql} program was not found. Please ensure the ${psql} is in your PATH`
        }
        vscode.window.showInformationMessage(message)

    })

    channel.show( vscode.ViewColumn.Two )
    bgtask.stdout.setEncoding('utf8')
    var dt = new Date();
    var utcDate = dt.toUTCString();
    channel.appendLine(`---------  ${utcDate}  ---------`)

    bgtask.stdout.on('data', data => channel.append(data) )
    bgtask.stderr.on('data', data => channel.append(data) )

    onEnd = onEnd ? onEnd : ()=>{}

    bgtask.stdout.on( 'end', () => {
        channel.appendLine( `${psql} end.\n` )
        onEnd()
    })

}

exports.runFile = runFile
exports.default = function() {

    const key = "pgsql"

    let channel = null //pointer to output window
    let conn // connection string for psql

    const loadConfig = () => {
        const section = vscode.workspace.getConfiguration( key )
        if ( section ) conn = section.get( "connection", null )
    }

    const activate = subscriptions => {
        channel = vscode.window.createOutputChannel( key )
        vscode.workspace.onDidChangeConfiguration( loadConfig, null, subscriptions ) //reload config on event
        loadConfig()
    }

    const run = ()=>{

        const editor = vscode.window.activeTextEditor;
        if ( !editor ) return // No any open text editor

        const doc = editor.document

        const text = doc.getText() 
        if ( !text ) return //nothing to run

        const selected = doc.getText( editor.selection ) 

        channel.show( vscode.ViewColumn.Two ) //open output window

        // no selection and doc is complete
        if ( !selected && !doc.isDirty ) return runFile( { conn, file: doc.fileName, channel } ) 

        // in any others cases, for example if ( doc.isUntitled ) or we have selection
        // Create temporary file with given text and execute it via psql
        const temppath = vscode.workspace.rootPath ? vscode.workspace.rootPath : __dirname
        const tempfile = path.join( temppath, ( Date.now() - 0 ) + '.pgsql' )

        const tempClean = () => fs.unlink( tempfile, err => {
            if ( err ) channel.appendLine('Can\'t delete temporary file: ' + tempfile )
        })

        const tempReady = err => {
            if ( err ) return channel.appendLine('Can\'t create temporary file: ' + tempfile )
            runFile( { conn, file: tempfile, channel, onEnd: tempClean } )
        }

        fs.writeFile( tempfile, selected ? selected : text, tempReady )

    }

    return { activate, run }

}
