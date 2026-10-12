import java.util.NoSuchElementException;

public class LinkedStack<T> {
    private static class Node<T> {
        T value;
        Node<T> next;
        Node(T value) { this.value = value; }
    }

    private Node<T> head;
    private int count;

    public void push(T item) {
        Node<T> node = new Node<>(item);
        node.next = head;
        head = node;
        count++;
    }

    public T pop() {
        if (head == null) {
            throw new NoSuchElementException("stack rong");
        }
        T result = head.value;
        head = head.next;
        count--;
        return result;
    }

    public T peek() {
        if (isEmpty()) {
            throw new NoSuchElementException("stack rong");
        }
        return head.value;
    }

    public boolean isEmpty() {
        return head == null;
    }

    public int size() {
        return count;
    }

    public void reverse() {
        Node<T> prev = null;
        Node<T> cur = head;
        while (cur != null) {
            Node<T> nxt = cur.next;
            cur.next = prev;
            prev = cur;
            cur = nxt;
        }
        head = prev;
    }

    public static void main(String[] args) {
        LinkedStack<String> stack = new LinkedStack<>();
        stack.push("a");
        stack.push("b");
        stack.push("c");
        stack.reverse();
        while (!stack.isEmpty()) {
            System.out.println(stack.pop());
        }
    }
}
